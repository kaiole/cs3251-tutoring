import type { APIRoute } from 'astro';
import { buildNoteManifest } from '../lib/notes';

export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildNoteManifest()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
