import pg from 'pg';

export interface Sql {
  query<T extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Sql {
  transaction<T>(operation: (sql: Sql) => Promise<T>, isolation?: 'repeatable read'): Promise<T>;
}

export function postgres(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  pool.on('error', () => console.error('Idle PostgreSQL connection lost'));
  const database: Database = {
    query: <T extends object>(text: string, values?: unknown[]) => pool.query<T>(text, values),
    async transaction(operation, isolation) {
      const client = await pool.connect();
      try {
        await client.query(isolation === 'repeatable read' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
  return { database, close: () => pool.end() };
}
