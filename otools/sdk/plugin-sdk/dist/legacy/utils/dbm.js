import { hostInvoke as _ } from "../platform/transport/hostBridge.js";
const b = [
  "数据库连接错误: ",
  "MySQL/MariaDB连接失败: ",
  "PostgreSQL连接失败: ",
  "SQL Server 连接失败: ",
  "SQLite连接失败: ",
  "MongoDB连接失败: ",
  "Redis连接失败: ",
  "Oracle连接失败: ",
  "查询执行错误: ",
  "MySQL/MariaDB查询失败: ",
  "PostgreSQL查询失败: ",
  "SQLite查询失败: ",
  "MongoDB查询失败: ",
  "Redis查询失败: ",
  "Oracle查询失败: "
], m = (t) => {
  let e = t.trim();
  const r = e.match(/^(第\s*\d+\s*条\s*SQL\s*执行失败:\s*)(.+)$/);
  if (r) {
    const [, a, s] = r;
    return `${a}${m(s)}`;
  }
  for (; ; ) {
    const a = b.find((s) => e.startsWith(s));
    if (!a)
      return e;
    e = e.slice(a.length).trim();
  }
}, d = (t) => {
  const e = m(t), r = e.match(/^\[([A-Z0-9_]+)\]\s*(.+)$/);
  if (r) {
    const [, N, D] = r, p = {
      DBM_MONGO_CONN_TIMEOUT: "MongoDB 连接超时，请检查网络、地址和端口后重试。",
      DBM_MONGO_CONN_AUTH: "MongoDB 认证失败，请检查用户名、密码和 authSource。",
      DBM_MONGO_CONN_TLS: "MongoDB TLS 握手失败，请检查 TLS 参数和证书配置。",
      DBM_MONGO_CONN_DNS: "MongoDB 地址解析失败，请检查主机名或 DNS 配置。",
      DBM_MYSQL_CONN_TIMEOUT: "MySQL/MariaDB 连接超时，请检查网络、地址和端口。",
      DBM_MYSQL_CONN_AUTH: "MySQL/MariaDB 认证失败，请检查用户名或密码。",
      DBM_MYSQL_CONN_TLS: "MySQL/MariaDB TLS 握手失败，请检查证书与加密参数。",
      DBM_MYSQL_CONN_DNS: "MySQL/MariaDB 地址解析失败，请检查主机名或 DNS。",
      DBM_MYSQL_CONN_UNKNOWN: "MySQL/MariaDB 连接失败，请检查连接参数。",
      DBM_PG_CONN_TIMEOUT: "PostgreSQL 连接超时，请检查网络、地址和端口。",
      DBM_PG_CONN_AUTH: "PostgreSQL 认证失败，请检查用户名或密码。",
      DBM_PG_CONN_TLS: "PostgreSQL TLS 握手失败，请检查证书与加密参数。",
      DBM_PG_CONN_DNS: "PostgreSQL 地址解析失败，请检查主机名或 DNS。",
      DBM_PG_CONN_UNKNOWN: "PostgreSQL 连接失败，请检查连接参数。",
      DBM_SQLSERVER_CONN_TIMEOUT: "SQL Server 连接超时，请检查网络、地址和端口。",
      DBM_SQLSERVER_CONN_AUTH: "SQL Server 认证失败，请检查用户名或密码。",
      DBM_SQLSERVER_CONN_TLS: "SQL Server TLS 握手失败，请检查证书与加密参数。",
      DBM_SQLSERVER_CONN_DNS: "SQL Server 地址解析失败，请检查主机名或 DNS。",
      DBM_SQLSERVER_CONN_UNKNOWN: "SQL Server 连接失败，请检查连接参数。",
      DBM_ORACLE_CONN_TIMEOUT: "Oracle 连接超时，请检查网络、地址和端口。",
      DBM_ORACLE_CONN_AUTH: "Oracle 认证失败，请检查用户名或密码。",
      DBM_ORACLE_CONN_TLS: "Oracle TLS 握手失败，请检查证书与加密参数。",
      DBM_ORACLE_CONN_DNS: "Oracle 地址解析失败，请检查主机名或 DNS。",
      DBM_ORACLE_CONN_UNKNOWN: "Oracle 连接失败，请检查连接参数。",
      DBM_KINGBASE_CONN_TIMEOUT: "KingbaseES 连接超时，请检查网络、地址和端口。",
      DBM_KINGBASE_CONN_AUTH: "KingbaseES 认证失败，请检查用户名或密码。",
      DBM_KINGBASE_CONN_TLS: "KingbaseES TLS 握手失败，请检查证书与加密参数。",
      DBM_KINGBASE_CONN_DNS: "KingbaseES 地址解析失败，请检查主机名或 DNS。",
      DBM_KINGBASE_CONN_UNKNOWN: "KingbaseES 连接失败，请检查连接参数。",
      DBM_DAMENG_CONN_TIMEOUT: "达梦连接超时，请检查网络、地址和端口。",
      DBM_DAMENG_CONN_AUTH: "达梦认证失败，请检查用户名或密码。",
      DBM_DAMENG_CONN_TLS: "达梦 TLS 握手失败，请检查证书与加密参数。",
      DBM_DAMENG_CONN_DNS: "达梦地址解析失败，请检查主机名或 DNS。",
      DBM_DAMENG_CONN_UNKNOWN: "达梦连接失败，请检查连接参数。",
      DBM_ES_CONN_TIMEOUT: "Elasticsearch 连接超时，请检查网络、地址和端口。",
      DBM_ES_CONN_AUTH: "Elasticsearch 认证失败，请检查用户名或密码。",
      DBM_ES_CONN_TLS: "Elasticsearch TLS 握手失败，请检查证书与加密参数。",
      DBM_ES_CONN_DNS: "Elasticsearch 地址解析失败，请检查主机名或 DNS。",
      DBM_ES_CONN_UNKNOWN: "Elasticsearch 连接失败，请检查连接参数。",
      DBM_CLICKHOUSE_CONN_TIMEOUT: "ClickHouse 连接超时，请检查网络、地址和端口。",
      DBM_CLICKHOUSE_CONN_AUTH: "ClickHouse 认证失败，请检查用户名或密码。",
      DBM_CLICKHOUSE_CONN_TLS: "ClickHouse TLS 握手失败，请检查证书与加密参数。",
      DBM_CLICKHOUSE_CONN_DNS: "ClickHouse 地址解析失败，请检查主机名或 DNS。",
      DBM_CLICKHOUSE_CONN_UNKNOWN: "ClickHouse 连接失败，请检查连接参数。",
      DBM_KAFKA_CONN_TIMEOUT: "Kafka 连接超时，请检查网络、地址和端口。",
      DBM_KAFKA_CONN_AUTH: "Kafka 认证失败，请检查用户名或密码。",
      DBM_KAFKA_CONN_TLS: "Kafka TLS 握手失败，请检查证书与加密参数。",
      DBM_KAFKA_CONN_DNS: "Kafka 地址解析失败，请检查主机名或 DNS。",
      DBM_KAFKA_CONN_UNKNOWN: "Kafka 连接失败，请检查连接参数。",
      DBM_SNOWFLAKE_CONN_TIMEOUT: "Snowflake 连接超时，请检查网络、地址和端口。",
      DBM_SNOWFLAKE_CONN_AUTH: "Snowflake 认证失败，请检查用户名或密码。",
      DBM_SNOWFLAKE_CONN_TLS: "Snowflake TLS 握手失败，请检查证书与加密参数。",
      DBM_SNOWFLAKE_CONN_DNS: "Snowflake 地址解析失败，请检查主机名或 DNS。",
      DBM_SNOWFLAKE_CONN_UNKNOWN: "Snowflake 连接失败，请检查连接参数。",
      DBM_REDIS_CONN_TIMEOUT: "Redis 连接超时，请检查网络和服务状态。",
      DBM_REDIS_CONN_AUTH: "Redis 认证失败，请检查用户名或密码。",
      DBM_REDIS_CONN_TLS: "Redis TLS/SSL 握手失败，请检查加密配置。",
      DBM_REDIS_CONN_DNS: "Redis 地址解析失败，请检查主机名或 DNS 配置。",
      DBM_REDIS_CONN_UNKNOWN: "Redis 连接失败，请检查连接参数。",
      DBM_REDIS_TXN_EXEC: "Redis 批量事务执行失败，已终止本次写入。",
      DBM_REDIS_WATCH_CONFLICT: "Redis 检测到并发冲突，本次保存已取消，请重试。",
      DBM_REDIS_KEY_EMPTY: "Redis 键名为空，请补全 key 后重试。",
      DBM_REDIS_KEY_MISSING: "Redis 记录缺少 key，请补全 key 后重试。",
      DBM_REDIS_VALUE_TYPE_MISSING: "Redis 记录缺少 value_type，请补全类型后重试。",
      DBM_REDIS_HASH_EMPTY: "Redis Hash 缺少 field，请补全数据后重试。",
      DBM_REDIS_HASH_FIELD_EMPTY: "Redis Hash 字段名为空，请补全 field 后重试。",
      DBM_REDIS_LIST_EMPTY: "Redis List 缺少成员，请补全 entries 后重试。",
      DBM_REDIS_SET_EMPTY: "Redis Set 缺少成员，请补全 entries 后重试。",
      DBM_REDIS_ZSET_EMPTY: "Redis ZSet 缺少成员，请补全 entries 后重试。",
      DBM_REDIS_ZSET_SCORE_INVALID: "Redis ZSet 的 score 非法，请检查数值后重试。",
      DBM_REDIS_TYPE_UNSUPPORTED: "Redis value_type 暂不支持写入，请检查类型设置。",
      DBM_REDIS_TTL_INVALID: "Redis ttl_seconds 非法，请输入大于等于 0 的值。"
    };
    return p[N] ? `${p[N]} ${D}` : D;
  }
  const a = e.match(
    /1142 \(42000\): (.+?) command denied to user '([^']+)'@'([^']+)'(?: for table '([^']+)')?/i
  );
  if (!a)
    return e;
  const [, s, i, o, c] = a, u = s.trim().toUpperCase(), S = c && c !== "view_name" ? `，对象：${c}` : "";
  return u === "CREATE VIEW" ? `当前账号 '${i}'@'${o}' 缺少 CREATE VIEW 权限，无法创建视图${S}。请为目标库授予 CREATE VIEW（通常也建议同时授予 SHOW VIEW）权限后重试。` : `当前账号 '${i}'@'${o}' 缺少 ${u} 权限，无法执行当前操作${S}。`;
}, g = (t, e = "操作失败") => {
  if (t instanceof Error && t.message)
    return d(t.message);
  if (typeof t == "string" && t.trim())
    return d(t);
  if (t && typeof t == "object") {
    const r = ["message", "msg", "error", "details"];
    for (const a of r) {
      const s = t[a];
      if (typeof s == "string" && s.trim())
        return d(s);
    }
    try {
      const a = JSON.stringify(t);
      if (a && a !== "{}")
        return d(a);
    } catch {
    }
  }
  return e;
}, n = (t, e = "操作失败") => new Error(g(t, e)), M = () => ({
  enabled: !1,
  host: "",
  port: 22,
  username: "",
  auth_type: "password",
  password: "",
  private_key_path: "",
  passphrase: ""
}), f = (t) => {
  const e = t || {}, r = e.auth_type === "private_key" || e.authType === "private_key" ? "private_key" : "password";
  return {
    ...M(),
    ...t || {},
    enabled: !!e.enabled,
    host: typeof e.host == "string" ? e.host : "",
    port: typeof e.port == "number" && Number.isFinite(e.port) && e.port > 0 ? e.port : 22,
    username: typeof e.username == "string" ? e.username : "",
    auth_type: r,
    password: typeof e.password == "string" ? e.password : "",
    private_key_path: typeof e.private_key_path == "string" ? e.private_key_path : typeof e.privateKeyPath == "string" ? e.privateKeyPath : "",
    passphrase: typeof e.passphrase == "string" ? e.passphrase : ""
  };
};
class l {
  // 连接管理
  static async addConnection(e) {
    const r = {
      ...e,
      id: Date.now().toString(),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      connection_string: y({
        ...e,
        id: Date.now().toString(),
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    };
    try {
      return await _("add_db_connection", { connection: r });
    } catch (a) {
      throw n(a, "保存连接失败");
    }
  }
  static async getConnections() {
    return await _("get_db_connections");
  }
  static async getConnection(e) {
    return await _("get_db_connection", { id: e });
  }
  static async updateConnection(e, r) {
    const a = {
      ...r,
      connection_string: y(r)
    };
    try {
      return await _("update_db_connection", { id: e, connection: a });
    } catch (s) {
      throw n(s, "更新连接失败");
    }
  }
  static async deleteConnection(e) {
    return await _("delete_db_connection", { id: e });
  }
  static async openConnection(e) {
    try {
      return await _("open_db_connection", { connection: e });
    } catch (r) {
      throw n(r, "连接失败");
    }
  }
  static async closeConnection(e) {
    return await _("close_db_connection", { id: e });
  }
  static async isConnectionActive(e) {
    return await _("is_db_connection_active", { id: e });
  }
  // 查询执行
  static async executeQuery(e, r, a) {
    try {
      return await _("execute_query", { connectionId: e, sql: r, databaseName: a });
    } catch (s) {
      throw n(s, "SQL 执行失败");
    }
  }
  static async executeWorkbenchQuery(e, r, a) {
    try {
      return await _("execute_query_workbench", { connectionId: e, sql: r, databaseName: a });
    } catch (s) {
      throw n(s, "SQL 执行失败");
    }
  }
  static async executeDashboardQuery(e, r, a) {
    try {
      return await _("dbm_execute_dashboard_query", {
        connectionId: e,
        sql: r,
        databaseName: a
      });
    } catch (s) {
      throw n(s, "大屏查询失败");
    }
  }
  static async getDatabases(e) {
    return await _("get_databases", { connectionId: e });
  }
  static async getSchemas(e, r) {
    return await _("get_schemas", { connectionId: e, databaseName: r });
  }
  static async getTables(e, r, a) {
    return await _("get_tables", { connectionId: e, databaseName: r, schemaName: a });
  }
  static async getTableData(e, r, a, s, i, o, c, u) {
    return await _("get_table_data", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      schemaName: s,
      limit: i,
      offset: o,
      orderBy: c,
      filters: u
    });
  }
  static async getRedisKeyInfo(e, r, a) {
    return await _("get_redis_key_info", {
      connectionId: e,
      databaseName: r,
      keyName: a
    });
  }
  static async getRedisTreeChildren(e, r, a, s, i, o) {
    try {
      return await _("get_redis_tree_children", {
        connectionId: e,
        databaseName: r,
        prefix: a,
        cursor: s,
        limit: i,
        keywords: o
      });
    } catch (c) {
      throw n(c, "加载 Redis 键目录失败");
    }
  }
  static async setRedisKey(e, r, a) {
    try {
      return await _("set_redis_key", {
        connectionId: e,
        databaseName: r,
        payload: a
      });
    } catch (s) {
      throw n(s, "保存 Redis 键失败");
    }
  }
  static async deleteRedisKey(e, r, a) {
    try {
      return await _("delete_redis_key", {
        connectionId: e,
        databaseName: r,
        keyName: a
      });
    } catch (s) {
      throw n(s, "删除 Redis 键失败");
    }
  }
  static async explainQuery(e, r) {
    return await _("explain_query", { connectionId: e, sql: r });
  }
  // 视图和存储过程
  static async getViews(e, r, a) {
    return await _("get_views", { connectionId: e, databaseName: r, schemaName: a });
  }
  static async getStoredProcedures(e, r, a) {
    return await _("get_stored_procedures", {
      connectionId: e,
      databaseName: r,
      schemaName: a
    });
  }
  static async getViewDefinition(e, r, a, s) {
    return await _("get_view_definition", {
      connectionId: e,
      databaseName: r,
      viewName: a,
      schemaName: s
    });
  }
  static async getProcedureDefinition(e, r, a, s) {
    return await _("get_procedure_definition", {
      connectionId: e,
      databaseName: r,
      procedureName: a,
      schemaName: s
    });
  }
  // 表结构
  static async getTableStruct(e, r, a, s) {
    return await _("get_table_struct", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      schemaName: s
    });
  }
  static async getAllTableStructs(e, r, a, s = !1) {
    return await _("get_all_table_structs", {
      connectionId: e,
      databaseName: r,
      schemaName: a,
      forceRefresh: s
    });
  }
  static async exportDataDictionaryDocx(e, r, a, s, i) {
    return await _("export_data_dictionary_docx", {
      connectionId: e,
      outputPath: r,
      databaseName: a,
      schemaName: s,
      progressToken: i
    });
  }
  static async getDatabaseStats(e) {
    return await _("get_database_stats", { connectionId: e });
  }
  // CRUD操作
  static async insertRecord(e, r, a) {
    return await _("insert_record", { connectionId: e, tableName: r, data: a });
  }
  static async updateRecord(e, r, a, s) {
    return await _("update_record", { connectionId: e, tableName: r, id: a, data: s });
  }
  static async deleteRecord(e, r, a) {
    return await _("delete_record", { connectionId: e, tableName: r, id: a });
  }
  static async bulkInsert(e, r, a) {
    return await _("bulk_insert", { connectionId: e, tableName: r, records: a });
  }
  static async paginatedQuery(e, r, a, s, i, o) {
    return await _("paginated_query", {
      connectionId: e,
      tableName: r,
      page: a,
      pageSize: s,
      orderBy: i,
      filters: o
    });
  }
  static async createTable(e, r, a, s, i) {
    return await _("create_table", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      columns: s,
      schemaName: i
    });
  }
  static async dropTable(e, r, a, s) {
    return await _("drop_table", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      schemaName: s
    });
  }
  // 数据库结构修改操作
  static async addColumn(e, r, a, s, i) {
    return await _("add_column", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      column: s,
      schemaName: i
    });
  }
  static async modifyColumn(e, r, a, s, i) {
    return await _("modify_column", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      column: s,
      schemaName: i
    });
  }
  static async deleteColumn(e, r, a, s, i) {
    return await _("delete_column", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      columnName: s,
      schemaName: i
    });
  }
  static async updateTableComment(e, r, a, s, i) {
    return await _("update_table_comment", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      comment: s,
      schemaName: i
    });
  }
  static async getCreateTableStatement(e, r, a, s) {
    return await _("get_create_table_statement", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      schemaName: s
    });
  }
  static async createIndex(e, r, a, s, i, o, c) {
    return await _("create_index", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      indexName: s,
      columns: i,
      isUnique: o,
      schemaName: c
    });
  }
  static async dropIndex(e, r, a, s, i) {
    return await _("drop_index", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      indexName: s,
      schemaName: i
    });
  }
  // 保存表数据更改
  static async saveTableData(e, r, a, s, i) {
    return await _("save_table_data", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      schemaName: s,
      changes: i
    });
  }
  static async importDatabaseFromSql(e, r, a) {
    return await _("import_database_from_sql_as_task", {
      connectionId: e,
      databaseName: r,
      filePath: a
    });
  }
  static async backupDatabase(e, r, a, s) {
    return await _("backup_database_as_task", {
      connectionId: e,
      databaseName: r,
      tableNames: a,
      exportPath: s || null
    });
  }
  static async restoreDatabaseFromBackup(e, r, a) {
    return await _("restore_database_from_backup_as_task", {
      connectionId: e,
      databaseName: r,
      filePath: a
    });
  }
  static async getBackupPlans() {
    return await _("dbm_get_backup_plans");
  }
  static async saveBackupPlans(e) {
    return await _("dbm_save_backup_plans", { plans: e });
  }
  static async triggerBackupPlan(e) {
    return await _("dbm_trigger_backup_plan", { planId: e });
  }
  static async getBackupStorageInfo(e) {
    return await _("dbm_get_backup_storage_info", { path: e || null });
  }
  static async syncDatabasesAsTask(e, r, a, s, i, o, c) {
    return await _("dbm_sync_databases_as_task", {
      sourceConnectionId: e,
      sourceDatabaseName: r,
      targetConnectionId: a,
      targetDatabaseName: s,
      syncStructure: i,
      syncData: o,
      planToken: c || null
    });
  }
  static async getSyncLogs() {
    return await _("dbm_get_sync_logs");
  }
  static async previewSyncPlan(e, r, a, s, i, o) {
    return await _("dbm_preview_sync_plan", {
      sourceConnectionId: e,
      sourceDatabaseName: r,
      targetConnectionId: a,
      targetDatabaseName: s,
      syncStructure: i,
      syncData: o
    });
  }
  static async importTableFromSql(e, r, a, s, i) {
    return await _("import_table_from_sql_as_task", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      schemaName: i,
      filePath: s
    });
  }
  static async importTableFromDataFile(e, r, a, s, i, o) {
    return await _("import_table_from_data_file_as_task", {
      connectionId: e,
      databaseName: r,
      tableName: a,
      schemaName: o,
      filePath: s,
      columnMappings: i
    });
  }
  static async getFileHeaders(e) {
    const r = e.split(".").pop()?.toLowerCase();
    let a = "csv";
    return r === "xlsx" || r === "xls" ? a = "excel" : r === "json" ? a = "json" : r === "sql" && (a = "sql"), await _("get_file_headers", { filePath: e, format: a });
  }
}
const O = {
  mysql: "MySQL",
  mariadb: "MariaDB",
  postgresql: "PostgreSQL",
  sqlserver: "SQL Server",
  kingbasees: "人大金仓",
  dameng: "达梦",
  sqlite: "SQLite",
  elasticsearch: "Elasticsearch",
  clickhouse: "ClickHouse",
  kafka: "Kafka",
  snowflake: "Snowflake",
  mongodb: "MongoDB",
  redis: "Redis",
  oracle: "Oracle"
};
function E(t) {
  switch (t.toLowerCase()) {
    case "mysql":
      return "MySQL";
    case "mariadb":
      return "MariaDB";
    case "postgresql":
      return "PostgreSQL";
    case "sqlserver":
      return "SQL Server";
    case "kingbasees":
      return "人大金仓";
    case "dameng":
      return "达梦";
    case "sqlite":
      return "SQLite";
    case "elasticsearch":
      return "Elasticsearch";
    case "clickhouse":
      return "ClickHouse";
    case "kafka":
      return "Kafka";
    case "snowflake":
      return "Snowflake";
    case "mongodb":
      return "MongoDB";
    case "redis":
      return "Redis";
    case "oracle":
      return "Oracle";
    default:
      return t;
  }
}
const h = (t) => t < 1e3 ? `${t}ms` : `${(t / 1e3).toFixed(2)}s`;
function y(t) {
  switch (t.db_type) {
    case "mysql":
      return `mysql://${t.username}:${t.password}@${t.host}:${t.port}/${t.database}`;
    case "mariadb":
      return `mariadb://${t.username}:${t.password}@${t.host}:${t.port}/${t.database}`;
    case "postgresql":
      return `postgresql://${t.username}:${t.password}@${t.host}:${t.port}/${t.database}`;
    case "sqlserver":
      return `sqlserver://${t.username}:${t.password}@${t.host}:${t.port}/${t.database}`;
    case "kingbasees":
      return `kingbasees://${t.username}:${t.password}@${t.host}:${t.port}/${t.database}`;
    case "dameng":
      return t.odbc?.connection_string || `odbc://${t.host}:${t.port}/${t.database}`;
    case "sqlite":
      return `sqlite://${t.database}`;
    case "elasticsearch":
      return `elasticsearch://${t.host}:${t.port}/${t.database}`;
    case "clickhouse":
      return `clickhouse://${t.username}:${t.password}@${t.host}:${t.port}/${t.database}`;
    case "kafka":
      return `kafka://${t.host}:${t.port}/${t.database || "topics"}`;
    case "snowflake":
      return `snowflake://${t.username}:${t.password}@${t.host}:${t.port}/${t.database}`;
    case "mongodb":
      return (() => {
        const r = `mongodb://${t.username ? `${t.username}:${t.password}@` : ""}${t.host}:${t.port}/${t.database}`, a = new URLSearchParams();
        t.mongodb?.auth_source?.trim() && a.set("authSource", t.mongodb.auth_source.trim()), t.mongodb?.auth_mechanism?.trim() && a.set("authMechanism", t.mongodb.auth_mechanism.trim()), t.mongodb?.replica_set?.trim() && a.set("replicaSet", t.mongodb.replica_set.trim()), t.mongodb?.read_preference?.trim() && a.set("readPreference", t.mongodb.read_preference.trim()), typeof t.mongodb?.retry_writes == "boolean" && a.set("retryWrites", t.mongodb.retry_writes ? "true" : "false"), t.mongodb?.tls && a.set("tls", "true"), t.mongodb?.tls_allow_invalid_certificates && a.set("tlsAllowInvalidCertificates", "true"), t.mongodb?.tls_ca_file?.trim() && a.set("tlsCAFile", t.mongodb.tls_ca_file.trim()), t.mongodb?.tls_certificate_key_file?.trim() && a.set("tlsCertificateKeyFile", t.mongodb.tls_certificate_key_file.trim()), t.mongodb?.tls_certificate_key_file_password?.trim() && a.set("tlsCertificateKeyFilePassword", t.mongodb.tls_certificate_key_file_password.trim());
        const s = a.toString();
        return s ? `${r}?${s}` : r;
      })();
    case "redis":
      return `redis://${t.password ? `:${t.password}@` : ""}${t.host}:${t.port}/${t.database || "0"}`;
    case "oracle":
      return `oracle://${t.username}:${t.password}@${t.host}:${t.port}/${t.database}`;
    default:
      return "";
  }
}
async function C(t, e, r) {
  try {
    return await l.importDatabaseFromSql(t, e, r);
  } catch (a) {
    throw console.error("启动数据库导入任务失败:", a), a;
  }
}
async function T(t, e, r, a, s) {
  try {
    return await l.importTableFromSql(t, e, r, a, s);
  } catch (i) {
    throw console.error("启动表导入任务失败:", i), i;
  }
}
async function B(t, e, r, a, s, i) {
  try {
    return await l.importTableFromDataFile(
      t,
      e,
      r,
      a,
      s,
      i
    );
  } catch (o) {
    throw console.error("启动数据文件导入任务失败:", o), o;
  }
}
async function L(t) {
  try {
    return await l.getFileHeaders(t);
  } catch (e) {
    throw console.error("获取文件头部失败:", e), e;
  }
}
async function k(t, e, r) {
  return await l.getTables(t, e, r);
}
async function $(t, e, r, a, s, i) {
  try {
    const o = {
      connectionId: t,
      databaseName: e,
      schemaName: i,
      tableNames: r,
      format: a,
      useFilters: !1,
      filters: {},
      remarks: `导出表 ${r.join(", ")}`,
      exportPath: s || null
    };
    return await _("export_multiple_tables", { params: o });
  } catch (o) {
    throw console.error("启动多表导出任务失败:", o), o;
  }
}
export {
  l as DbmApi,
  M as createDefaultDbSshConfig,
  O as dbTypeLabels,
  $ as exportMultipleTables,
  g as extractDbmErrorMessage,
  h as formatExecutionTime,
  y as generateConnectionString,
  E as getDbTypeLabel,
  L as getFileHeaders,
  k as getTables,
  C as importDatabaseFromSql,
  B as importTableFromDataFile,
  T as importTableFromSql,
  f as normalizeDbSshConfig,
  n as toDbmError
};
//# sourceMappingURL=dbm.js.map
