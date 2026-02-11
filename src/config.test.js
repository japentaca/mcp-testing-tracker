import config from './config.js';

describe('Configuration', () => {
  test('should have default port', () => {
    expect(config.port).toBeDefined();
    expect(typeof config.port).toBe('number');
  });

  test('should have node environment', () => {
    expect(config.nodeEnv).toBeDefined();
    expect(typeof config.nodeEnv).toBe('string');
  });

  test('should have database configuration', () => {
    expect(config.database).toBeDefined();
    expect(config.database.path).toBeDefined();
    expect(typeof config.database.path).toBe('string');
  });

  test('should have CORS configuration', () => {
    expect(config.cors).toBeDefined();
    expect(config.cors.origins).toBeDefined();
    expect(Array.isArray(config.cors.origins)).toBe(true);
    expect(config.cors.origins.length).toBeGreaterThan(0);
  });

  test('should have logging configuration', () => {
    expect(config.logging).toBeDefined();
    expect(config.logging.format).toBeDefined();
    expect(typeof config.logging.format).toBe('string');
  });

  test('CORS origins should be valid URLs', () => {
    config.cors.origins.forEach(origin => {
      expect(origin).toMatch(/^https?:\/\//);
    });
  });

  test('port should be a valid port number', () => {
    expect(config.port).toBeGreaterThan(0);
    expect(config.port).toBeLessThan(65536);
  });

  test('database path should end with .db', () => {
    expect(config.database.path).toMatch(/\.db$/);
  });
});
