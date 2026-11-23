// Sends a receipt through the WhatsApp Business API. Called by the app at /.netlify/functions/whatsapp-send.
// All the work is in ../lib/receiptSend.mjs; this file only hands it the real environment and the real network.
import { handleSend } from '../lib/receiptSend.mjs'

export default async (request) => handleSend(request, { env: process.env, fetch: globalThis.fetch })
