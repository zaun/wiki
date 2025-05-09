const request = require('supertest');

const API_URL = 'http://localhost:3000';

describe('Node API', () => {
  it('should get the root node', async () => {
    const res = await request(API_URL).get('/api/nodes/00000000-0000-0000-0000-000000000000');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', '00000000-0000-0000-0000-000000000000');
  });

});
