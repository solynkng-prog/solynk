const request = require('supertest');
const app = require('../../src/app');

describe('SOLYNK API Integration Tests', () => {
  describe('Health Check', () => {
    test('GET /health returns healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('API Info', () => {
    test('GET /api/v1 returns API info', async () => {
      const res = await request(app).get('/api/v1');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('SOLYNK API');
      expect(res.body.endpoints).toBeDefined();
    });
  });

  describe('Auth Routes', () => {
    test('POST /api/v1/auth/register validates input', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Calculator Routes', () => {
    test('POST /api/v1/calculate requires auth', async () => {
      const res = await request(app)
        .post('/api/v1/calculate')
        .send({ appliances: [] });

      expect(res.status).toBe(401);
    });
  });

  describe('AI Routes', () => {
    test('POST /api/v1/ai/chat accepts anonymous requests', async () => {
      const res = await request(app)
        .post('/api/v1/ai/chat')
        .send({ message: 'How much battery backup do I need?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.response).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    test('Returns 404 for unknown routes', async () => {
      const res = await request(app).get('/api/v1/unknown-route');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
