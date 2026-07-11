export declare const extractDbmErrorMessage: (error: unknown, fallback?: string) => string;
export declare const toDbmError: (error: unknown, fallback?: string) => Error;
export type DbSshAuthType = 'password' | 'private_key';
export interface DbOdbcConfig {
    mode: 'driver' | 'dsn' | 'connection_string';
    dsn: string;
    driver: string;
    connection_string: string;
    extra: string;
}
export interface DbMongoConfig {
    auth_source: string;
    auth_mechanism: string;
    replica_set: string;
    read_preference: string;
    retry_writes?: boolean | null;
    tls: boolean;
    tls_allow_invalid_certificates: boolean;
    tls_ca_file: string;
    tls_certificate_key_file: string;
    tls_certificate_key_file_password: string;
}
export interface DbSshConfig {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    auth_type: DbSshAuthType;
    password: string;
    private_key_path: string;
    passphrase: string;
}
export declare const createDefaultDbSshConfig: () => DbSshConfig;
export declare const normalizeDbSshConfig: (ssh?: Partial<DbSshConfig> | null) => DbSshConfig;
export interface DbConnection {
    id: string;
    name: string;
    db_type: 'mysql' | 'mariadb' | 'postgresql' | 'sqlserver' | 'kingbasees' | 'dameng' | 'sqlite' | 'elasticsearch' | 'clickhouse' | 'kafka' | 'snowflake' | 'mongodb' | 'redis' | 'oracle';
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssh?: DbSshConfig | null;
    odbc?: DbOdbcConfig | null;
    mongodb?: DbMongoConfig | null;
    created_at: string;
    connection_string: string;
    isConnected?: boolean;
}
export interface QueryStatementResult {
    statement_index: number;
    sql: string;
    sql_preview: string;
    columns: string[];
    rows: any[][];
    row_count: number | null;
    execution_time: number | null;
    success?: boolean;
    error_message?: string | null;
}
export interface QueryResult {
    columns: string[];
    rows: any[][];
    row_count: number | null;
    execution_time: number | null;
    statements?: QueryStatementResult[];
    has_errors?: boolean;
    batch_error_message?: string | null;
    failed_statement_index?: number | null;
}
export interface RedisKeyInfo {
    key: string;
    database: string;
    value_type: string;
    ttl_seconds: number;
    ttl_label: string;
    columns: string[];
    rows: any[][];
}
export interface RedisKeyEntry {
    field?: string | null;
    value: string;
    score?: string | null;
}
export interface RedisKeyMutation {
    key_name: string;
    value_type: 'string' | 'hash' | 'list' | 'set' | 'zset';
    ttl_seconds?: number | null;
    entries: RedisKeyEntry[];
}
export interface RedisTreeNode {
    node_type: 'prefix' | 'key';
    label: string;
    full_path: string;
}
export interface RedisTreeChildrenPage {
    nodes: RedisTreeNode[];
    next_cursor?: string | null;
}
export interface TableStruct {
    table_name: string;
    columns: ColumnSchema[];
    primary_keys: string[];
    foreign_keys: ForeignKey[];
    indexes: IndexInfo[];
    comment: string;
}
export interface ColumnSchema {
    name: string;
    data_type: string;
    is_nullable: boolean;
    default_value: string | null;
    is_primary_key: boolean;
    character_maximum_length: number | null;
    original_name?: string;
    column_comment?: string;
}
export interface ColumnModifySchema {
    name: string;
    data_type: string;
    is_nullable: boolean;
    default_value: string | null;
    character_maximum_length: number | null;
    is_primary_key: boolean;
    column_comment?: string;
    old_name?: string;
}
export interface ForeignKey {
    constraint_name: string;
    column_name: string;
    referenced_schema?: string | null;
    referenced_table: string;
    referenced_column: string;
}
export interface IndexInfo {
    name: string;
    columns: string[];
    is_unique: boolean;
}
export type BackupPlanScheduleType = 'daily' | 'interval';
export interface BackupPlan {
    id: string;
    name: string;
    connectionId: string;
    databaseName: string;
    exportPath: string;
    scheduleType: BackupPlanScheduleType;
    dailyTime: string;
    intervalHours: number;
    enabled: boolean;
    retentionDays: number;
    createdAt: string;
    lastTriggeredAt?: string | null;
    lastTaskId?: string | null;
    lastRunStatus?: string | null;
    lastSuccessAt?: string | null;
    lastErrorMessage?: string | null;
}
export interface BackupStorageInfo {
    path: string;
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usagePercent: number;
    sampleBackupCount: number;
    averageBackupBytes: number;
    estimatedBackupCount: number;
}
export interface DbSyncLog {
    id: string;
    taskId: string;
    sourceConnectionId: string;
    sourceDatabaseName: string;
    targetConnectionId: string;
    targetDatabaseName: string;
    syncStructure: boolean;
    syncData: boolean;
    tableCount: number;
    status: string;
    message?: string | null;
    createdAt: string;
    finishedAt?: string | null;
    resultFile?: string | null;
    createdTableCount?: number;
    alteredTableCount?: number;
    failedTableCount?: number;
    insertedCount?: number;
    updatedCount?: number;
    deletedCount?: number;
    details?: DbSyncTableDetail[];
}
export interface DbSyncTableDetail {
    tableName: string;
    structureStatus?: string;
    dataStatus?: string;
    structureActions?: string[];
    insertedCount?: number;
    updatedCount?: number;
    deletedCount?: number;
    skippedReason?: string | null;
    errorMessage?: string | null;
    elapsedMs?: number;
    sqlCount?: number;
    retryCount?: number;
}
export interface DbSyncPreviewResult {
    tableCount: number;
    createdTableCount: number;
    alteredTableCount: number;
    failedTableCount: number;
    insertedCount: number;
    updatedCount: number;
    deletedCount: number;
    details: DbSyncTableDetail[];
    sqlStatements: string[];
    message: string;
    planToken?: string;
}
export declare class DbmApi {
    static addConnection(connection: Omit<DbConnection, 'id' | 'created_at'>): Promise<string>;
    static getConnections(): Promise<DbConnection[]>;
    static getConnection(id: string): Promise<DbConnection | null>;
    static updateConnection(id: string, connection: DbConnection): Promise<void>;
    static deleteConnection(id: string): Promise<void>;
    static openConnection(connection: DbConnection): Promise<boolean>;
    static closeConnection(id: string): Promise<boolean>;
    static isConnectionActive(id: string): Promise<boolean>;
    static executeQuery(connectionId: string, sql: string, databaseName?: string): Promise<QueryResult>;
    static executeWorkbenchQuery(connectionId: string, sql: string, databaseName?: string): Promise<QueryResult>;
    static executeDashboardQuery(connectionId: string, sql: string, databaseName?: string): Promise<QueryResult>;
    static getDatabases(connectionId: string): Promise<string[]>;
    static getSchemas(connectionId: string, databaseName?: string): Promise<string[]>;
    static getTables(connectionId: string, databaseName?: string, schemaName?: string): Promise<string[]>;
    static getTableData(connectionId: string, databaseName: string | undefined, tableName: string, schemaName?: string, limit?: number, offset?: number, orderBy?: string, filters?: Record<string, any>): Promise<QueryResult>;
    static getRedisKeyInfo(connectionId: string, databaseName: string | undefined, keyName: string): Promise<RedisKeyInfo>;
    static getRedisTreeChildren(connectionId: string, databaseName: string | undefined, prefix?: string, cursor?: string, limit?: number, keywords?: string[]): Promise<RedisTreeChildrenPage>;
    static setRedisKey(connectionId: string, databaseName: string | undefined, payload: RedisKeyMutation): Promise<RedisKeyInfo>;
    static deleteRedisKey(connectionId: string, databaseName: string | undefined, keyName: string): Promise<void>;
    static explainQuery(connectionId: string, sql: string): Promise<QueryResult>;
    static getViews(connectionId: string, databaseName?: string, schemaName?: string): Promise<string[]>;
    static getStoredProcedures(connectionId: string, databaseName?: string, schemaName?: string): Promise<string[]>;
    static getViewDefinition(connectionId: string, databaseName: string | undefined, viewName: string, schemaName?: string): Promise<string>;
    static getProcedureDefinition(connectionId: string, databaseName: string | undefined, procedureName: string, schemaName?: string): Promise<string>;
    static getTableStruct(connectionId: string, databaseName: string | undefined, tableName: string, schemaName?: string): Promise<TableStruct>;
    static getAllTableStructs(connectionId: string, databaseName?: string, schemaName?: string, forceRefresh?: boolean): Promise<TableStruct[]>;
    static exportDataDictionaryDocx(connectionId: string, outputPath: string, databaseName?: string, schemaName?: string, progressToken?: string): Promise<string>;
    static getDatabaseStats(connectionId: string): Promise<any>;
    static insertRecord(connectionId: string, tableName: string, data: Record<string, any>): Promise<QueryResult>;
    static updateRecord(connectionId: string, tableName: string, id: any, data: Record<string, any>): Promise<QueryResult>;
    static deleteRecord(connectionId: string, tableName: string, id: any): Promise<QueryResult>;
    static bulkInsert(connectionId: string, tableName: string, records: Record<string, any>[]): Promise<QueryResult>;
    static paginatedQuery(connectionId: string, tableName: string, page: number, pageSize: number, orderBy?: string, filters?: Record<string, any>): Promise<QueryResult>;
    static createTable(connectionId: string, databaseName: string | undefined, tableName: string, columns: ColumnModifySchema[], schemaName?: string): Promise<QueryResult>;
    static dropTable(connectionId: string, databaseName: string | undefined, tableName: string, schemaName?: string): Promise<QueryResult>;
    static addColumn(connectionId: string, databaseName: string | undefined, tableName: string, column: ColumnModifySchema, schemaName?: string): Promise<QueryResult>;
    static modifyColumn(connectionId: string, databaseName: string | undefined, tableName: string, column: ColumnModifySchema, schemaName?: string): Promise<QueryResult>;
    static deleteColumn(connectionId: string, databaseName: string | undefined, tableName: string, columnName: string, schemaName?: string): Promise<QueryResult>;
    static updateTableComment(connectionId: string, databaseName: string | undefined, tableName: string, comment: string, schemaName?: string): Promise<QueryResult>;
    static getCreateTableStatement(connectionId: string, databaseName: string | undefined, tableName: string, schemaName?: string): Promise<string>;
    static createIndex(connectionId: string, databaseName: string | undefined, tableName: string, indexName: string, columns: string[], isUnique: boolean, schemaName?: string): Promise<QueryResult>;
    static dropIndex(connectionId: string, databaseName: string | undefined, tableName: string, indexName: string, schemaName?: string): Promise<QueryResult>;
    static saveTableData(connectionId: string, databaseName: string, tableName: string, schemaName: string | undefined, changes: {
        added: any[];
        modified: Array<{
            current: any;
            original: any;
        }>;
        deleted: any[];
        validate_only?: boolean;
        redis_atomic_batch?: boolean;
        redis_watch_keys?: boolean;
    }): Promise<any>;
    static importDatabaseFromSql(connectionId: string, databaseName: string, filePath: string): Promise<unknown>;
    static backupDatabase(connectionId: string, databaseName: string, tableNames: string[], exportPath?: string): Promise<string>;
    static restoreDatabaseFromBackup(connectionId: string, databaseName: string, filePath: string): Promise<string>;
    static getBackupPlans(): Promise<BackupPlan[]>;
    static saveBackupPlans(plans: BackupPlan[]): Promise<BackupPlan[]>;
    static triggerBackupPlan(planId: string): Promise<string>;
    static getBackupStorageInfo(path?: string): Promise<BackupStorageInfo>;
    static syncDatabasesAsTask(sourceConnectionId: string, sourceDatabaseName: string, targetConnectionId: string, targetDatabaseName: string, syncStructure: boolean, syncData: boolean, planToken?: string | null): Promise<string>;
    static getSyncLogs(): Promise<DbSyncLog[]>;
    static previewSyncPlan(sourceConnectionId: string, sourceDatabaseName: string, targetConnectionId: string, targetDatabaseName: string, syncStructure: boolean, syncData: boolean): Promise<DbSyncPreviewResult>;
    static importTableFromSql(connectionId: string, databaseName: string, tableName: string, filePath: string, schemaName?: string): Promise<unknown>;
    static importTableFromDataFile(connectionId: string, databaseName: string, tableName: string, filePath: string, columnMappings: Record<string, string | null>, schemaName?: string): Promise<unknown>;
    static getFileHeaders(filePath: string): Promise<string[]>;
}
export declare const dbTypeLabels: Record<string, string>;
export declare function getDbTypeLabel(dbType: string): string;
export declare const formatExecutionTime: (milliseconds: number) => string;
export declare function generateConnectionString(connection: DbConnection): string;
export declare function importDatabaseFromSql(connectionId: string, databaseName: string, filePath: string): Promise<unknown>;
export declare function importTableFromSql(connectionId: string, databaseName: string, tableName: string, filePath: string, schemaName?: string): Promise<unknown>;
export declare function importTableFromDataFile(connectionId: string, databaseName: string, tableName: string, filePath: string, columnMappings: Record<string, string | null>, schemaName?: string): Promise<unknown>;
export declare function getFileHeaders(filePath: string): Promise<string[]>;
export declare function getTables(connectionId: string, databaseName?: string, schemaName?: string): Promise<string[]>;
export declare function exportMultipleTables(connectionId: string, databaseName: string, tableNames: string[], format: 'csv' | 'json' | 'sql' | 'excel', exportPath?: string, schemaName?: string): Promise<unknown>;
