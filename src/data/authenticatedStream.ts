/** EventSource-compatible SSE reader that keeps bearer tokens out of URLs and logs. */
export interface StreamLike {
  onopen: (() => void) | null;
  onmessage: ((message: MessageEvent<string>) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export type TokenProvider = () => Promise<string | null>;

export function createAuthenticatedStream(url: string, getToken: TokenProvider): StreamLike {
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const stream: StreamLike = { onopen: null, onmessage: null, onerror: null,
    close: () => { abort.abort(); void reader?.cancel().catch(() => {}); } };
  const delay = () => new Promise<void>(resolve => {
    if (abort.signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, 1000);
    abort.signal.addEventListener('abort', done, { once: true });
  });
  queueMicrotask(() => { void (async () => {
    while (!abort.signal.aborted) {
      try {
        const token = await getToken();
        if (abort.signal.aborted) break;
        if (!token) throw new Error('Authentication required');
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          credentials: 'omit', signal: abort.signal, cache: 'no-store' });
        if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
          throw new Error('Stream unavailable');
        }
        reader = response.body.getReader();
        stream.onopen?.();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!abort.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          // The cloud API emits LF; also accept CRLF and chunks ending between CR/LF.
          let boundary: RegExpExecArray | null;
          while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
            const block = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const data = block.split(/\r?\n/).filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).replace(/^ /, '')).join('\n');
            if (data && !abort.signal.aborted) stream.onmessage?.({ data } as MessageEvent<string>);
          }
          if (buffer.length > 1_000_000) throw new Error('Stream message too large');
        }
      } catch {
        if (!abort.signal.aborted) stream.onerror?.();
      } finally {
        try { reader?.releaseLock(); } catch { /* reader may have been cancelled */ }
        reader = undefined;
      }
      if (!abort.signal.aborted) await delay();
    }
  })(); });
  return stream;
}
