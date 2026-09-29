import request from 'supertest';
import app from '../../../app';
import { config } from '../../../config';

describe('Soroban RPC Console', () => {
  let authToken: string;

  beforeAll(async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: config.test.user.email,
        password: config.test.user.password,
      });
    authToken = response.body.token;
  });

  it('should execute getHealth method', async () => {
    const response = await request(app)
      .post('/api/soroban/rpc/console')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ method: 'getHealth' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
  });

  it('should reject invalid method', async () => {
    const response = await request(app)
      .post('/api/soroban/rpc/console')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ method: 'invalidMethod' });

    expect(response.status).toBe(400);
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .post('/api/soroban/rpc/console')
      .send({ method: 'getHealth' });

    expect(response.status).toBe(401);
  });
});