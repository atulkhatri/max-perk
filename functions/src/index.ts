import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';
import { logger } from 'firebase-functions/v2';
import {
  AskPickRequest,
  normalizeText,
  validatePickLegs,
  buildSystemPrompt,
  type MerchantRef,
} from './contract.js';

initializeApp();

const MODEL_API_KEY = defineSecret('MODEL_API_KEY');
const MODEL_ID = 'muse-spark-1.3';
const MODEL_TIMEOUT_MS = 25000;
const MAX_CALLS_PER_DAY = 30;

/** Client sends the raw sentence; the key and catalog never leave the server. */
export const askPick = onCall(
  { secrets: [MODEL_API_KEY], timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    const startedAt = Date.now();
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use ask-pick.');
    }
    const text = normalizeText(String((request.data as AskPickRequest)?.text ?? ''));
    if (!text) return { ok: false, error: 'empty' } as const;
    if (text.length >= 500) return { ok: false, error: 'too_long' } as const;

    const db = getFirestore();
    // Kill switch: one console edit disables the feature with no deploy.
    const flag = await db.doc('config/askPick').get();
    if (flag.exists && flag.get('enabled') === false) {
      return { ok: false, error: 'disabled' } as const;
    }

    // Per-user daily budget.
    const day = new Date().toISOString().slice(0, 10);
    const usageRef = db.doc(`usage/askPick/${request.auth.uid}/${day}`);
    const usage = await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const count = snap.exists ? Number(snap.get('count') ?? 0) : 0;
      if (count >= MAX_CALLS_PER_DAY) return count;
      tx.set(usageRef, { count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return count + 1;
    });
    if (usage > MAX_CALLS_PER_DAY) return { ok: false, error: 'rate_limited' } as const;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      // Catalog snapshot pins merchant ids and the dataAsOf the prompt was built
      // from. Inside the guarded block: emulator, empty-catalog, and permission
      // failures degrade to model_error, never an INTERNAL crash.
      const catSnap = await db.doc('catalog/v1').get().catch(() => null);
      const dataAsOf = String(catSnap?.get('dataAsOf') ?? 'unknown');
      const merchantsSnap = await db.collection('catalog/v1/merchants').get().catch(() => null);
      const merchants: MerchantRef[] = (merchantsSnap?.docs ?? []).map((d) => ({
        id: d.id,
        name: String(d.get('name') ?? d.id),
      }));

      const res = await fetch('https://api.meta.ai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${MODEL_API_KEY.value()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [
            { role: 'system', content: buildSystemPrompt(merchants, dataAsOf) },
            { role: 'user', content: text },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'pick_legs',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  legs: {
                    type: 'array',
                    maxItems: 6,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        merchantId: { type: 'string' },
                        earn: {
                          type: 'string',
                          enum: [
                            'grocery', 'dining', 'gas', 'travel', 'drugstore',
                            'transit', 'recurring', 'foreign', 'other',
                          ],
                        },
                        context: { type: 'string', enum: ['general', 'electronics', 'carRental', 'hotels'] },
                        spendCAD: { type: 'number' },
                        storeName: { type: 'string' },
                      },
                      required: ['merchantId', 'storeName', 'earn', 'context', 'spendCAD'],
                    },
                  },
                  interpretation: { type: 'string' },
                  confidence: { type: 'number' },
                  clarification: { type: 'string' },
                },
                required: ['legs', 'interpretation', 'confidence', 'clarification'],
              },
            },
          },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        logger.warn('askPick model non-200', { status: res.status, body: errText.slice(0, 300) });
        return { ok: false, error: 'model_error' } as const;
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = body.choices?.[0]?.message?.content ?? '';
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.warn('askPick model output unparseable', { preview: content.slice(0, 300) });
        return { ok: false, error: 'invalid' } as const;
      }
      logger.info('askPick model content', { preview: content.slice(0, 1500) });
      logger.info('askPick model call', { model: MODEL_ID, ms: Date.now() - startedAt });
      const checked = validatePickLegs(parsed, merchants);
      if (!checked) {
        logger.info('askPick validation rejected output', { parsed: JSON.stringify(parsed).slice(0, 1500) });
      }
      if (!checked || 'clarification' in checked) {
        return {
          ok: true,
          legs: [],
          interpretation: '',
          clarification:
            (checked && 'clarification' in checked && checked.clarification) ||
            'I could not tell what that purchase was. Try naming the store, the category, and the amount.',
        } as const;
      }
      return { ok: true, legs: checked.legs, interpretation: checked.interpretation } as const;
    } catch (err) {
      // Timeout, network, bad key: the client falls back to the manual form.
      logger.warn('askPick request failed', { message: err instanceof Error ? err.message : String(err) });
      return { ok: false, error: 'model_error' } as const;
    } finally {
      clearTimeout(timer);
    }
  },
);
