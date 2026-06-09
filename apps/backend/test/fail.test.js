import { test, expect } from 'vitest';

test('Fallo forzado para validar bloqueo de CI/CD', () => {
  // Esto fallará obligatoriamente para frenar el despliegue
  expect(1).toBe(2);
});
