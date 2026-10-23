import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiClient } from '../src/services/httpClient.ts';

test('tender uploads retain file bytes, multipart boundary and authorization; CRUD stays JSON', async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ imported: 1 }));
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const api = createApiClient(`http://127.0.0.1:${server.address().port}/api`);
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0xff, 0x80]);
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'tenders.xlsx');
    await api.post('/radar/admin/tenders/upload', form, { headers: { Authorization: 'Bearer test-key' }, proxy: false });
    const upload = requests[0];
    assert.match(upload.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.equal(upload.headers.authorization, 'Bearer test-key');
    assert.ok(upload.body.includes(bytes));
    assert.match(upload.body.toString(), /name="file"; filename="tenders.xlsx"/);
    const boundary = upload.headers['content-type'].split('boundary=')[1];
    assert.ok(upload.body.includes(Buffer.from(`--${boundary}--`)));
    await api.post('/radar/admin/regions', { code: 'SA', name: 'South Asia' }, { proxy: false });
    assert.match(requests[1].headers['content-type'], /^application\/json/);
    assert.deepEqual(JSON.parse(requests[1].body), { code: 'SA', name: 'South Asia' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
