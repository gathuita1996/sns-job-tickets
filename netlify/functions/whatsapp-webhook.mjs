// Where WhatsApp reports whether each receipt was sent, delivered or read. Meta calls it at
// https://<your site>/.netlify/functions/whatsapp-webhook. All the work is in ../lib/webhook.mjs.
import { handleWebhook } from '../lib/webhook.mjs'

export default async (request) => handleWebhook(request, { env: process.env, fetch: globalThis.fetch })
