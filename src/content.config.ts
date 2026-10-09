import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /**
         * Immutable identifier for questions about this note, independent of filename, title and
         * URL. Required for every page under notes/ (enforced by src/lib/notes.ts at build time).
         * Never change or reuse one once published.
         */
        noteId: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,79}$/, 'noteId: lowercase letters, digits and hyphens only')
          .optional(),
        /** Optional topic label used for filtering questions. */
        topic: z.string().min(1).max(80).optional(),
      }),
    }),
  }),
};
