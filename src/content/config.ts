import { defineCollection, z } from 'astro:content';

const workSchema = z.object({
	title: z.string(),
	description: z.string(),
	publishDate: z.coerce.date(),
	tags: z.array(z.string()),
	img: z.string().optional(),
	img_alt: z.string().optional(),
	gallery: z
		.array(z.object({ src: z.string(), alt: z.string().optional() }))
		.optional(),
	galleryTitle: z.string().optional(),
	galleryLayout: z.enum(['phone', 'wide']).optional(),
	role: z.string().optional(),
	org: z.string().optional(),
});

export const collections = {
	work: defineCollection({ type: 'content', schema: workSchema }),
	// English portfolio. Same slugs as `work` so /work/x and /en/work/x pair up for hreflang.
	'work-en': defineCollection({ type: 'content', schema: workSchema }),
};
