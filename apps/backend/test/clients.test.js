import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => { app = await getApp(); token = (await login(app)).token; });

describe('Clientes (domicilios)', () => {
  const phone = '+56 9 8765 4321';

  it('crea un cliente', async () => {
    const res = await request(app).post('/api/clients').set('Authorization', bearer())
      .send({ name: 'Juan Pérez', phone, address: 'Av. Siempre Viva 742' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.phone).toBe('+56987654321'); // normalizado
  });

  it('busca por teléfono (normalizado)', async () => {
    const res = await request(app).get('/api/clients').query({ phone: '+56 9 8765 4321' }).set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body?.name).toBe('Juan Pérez');
  });

  it('hace upsert por teléfono (no duplica, actualiza datos)', async () => {
    const a = await request(app).post('/api/clients').set('Authorization', bearer())
      .send({ name: 'Juan P.', phone, address: 'Nueva dirección 100' });
    expect(a.status).toBe(201);
    const list = await request(app).get('/api/clients').query({ q: 'Juan' }).set('Authorization', bearer());
    const matches = list.body.filter((c) => c.phone === '+56987654321');
    expect(matches).toHaveLength(1);
    expect(matches[0].address).toBe('Nueva dirección 100');
  });

  it('exige nombre', async () => {
    const res = await request(app).post('/api/clients').set('Authorization', bearer()).send({ phone: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NOMBRE_REQUERIDO');
  });
});
