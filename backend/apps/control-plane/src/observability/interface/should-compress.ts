import compression from 'compression';
import type { Request, Response } from 'express';

const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream';

// Server-sent events go out uncompressed: compression would hold the AI reply stream back
// until it ends.
export function shouldCompress(request: Request, response: Response): boolean {
	const contentType = String(response.getHeader('Content-Type') ?? '');
	const isEventStream = contentType.includes(EVENT_STREAM_CONTENT_TYPE);

	if (isEventStream) {
		return false;
	}

	return compression.filter(request, response);
}
