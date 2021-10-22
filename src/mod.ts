import { Client, StorageAdapter, buildQueryRunner } from './deps.deno.ts'

interface AdapterConstructor {
  client: Client;
  tableName: string,
  query: (query: string, params?: string[] | undefined) => Promise<any>
}

interface DbOject {
  key: string,
  value: string
}

export class PsqlAdapter<T> implements StorageAdapter<T> {
  private tableName: string
  private query = (query: string, params?: string[] | undefined): Promise<unknown> | unknown => null

  /**
    * @private
  */
  private constructor(opts: AdapterConstructor) {
    this.tableName = opts.tableName
    this.query = opts.query
  }

  static async create(opts = { tableName: 'sessions' } as Omit<AdapterConstructor, 'query'>) {
    const queryString = `
      CREATE TABLE IF NOT EXISTS "$1" (
        "key" VARCHAR NOT NULL,
        "value" TEXT
      )`
    const query = buildQueryRunner(opts.client)
    await query(queryString, [opts.tableName])
    await query(`CREATE UNIQUE INDEX "IDX_$1" ON "$1" ("key")`, [opts.tableName])

    return new PsqlAdapter({
      ...opts,
      query,
    })
  }

  private async findSession(key: string) {
    const results = await this.query(`select * from "$1" where key = $2`, [this.tableName, key]) as DbOject[]
    const session = results[0]

    return session
  }

  async read(key: string) {
    const session = await this.findSession(key)

    if (!session) {
      return undefined
    }

    return JSON.parse(session.value as string) as T
  }

  async write(key: string, value: T) {
    await this.query(`
      INSERT INTO "$1" (key, value)
      values ($2, $3)
      ON CONFLICT (key) DO UPDATE SET value = $3`, 
      [this.tableName, key, JSON.stringify(value)]
    )
  }

  async delete(key: string) {
    await this.query(`delete from $1 where key = $2`, [this.tableName, key])
  }
}
