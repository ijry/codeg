export declare class LogicalPosition {
    readonly x: number;
    readonly y: number;
    readonly type = "Logical";
    constructor(x: number, y: number);
    toLogical(): LogicalPosition;
    toPhysical(scaleFactor?: number): PhysicalPosition;
}
export declare class PhysicalPosition {
    readonly x: number;
    readonly y: number;
    readonly type = "Physical";
    constructor(x: number, y: number);
    toLogical(scaleFactor?: number): LogicalPosition;
    toPhysical(): PhysicalPosition;
}
export declare class LogicalSize {
    readonly width: number;
    readonly height: number;
    readonly type = "Logical";
    constructor(width: number, height: number);
    toLogical(): LogicalSize;
    toPhysical(scaleFactor?: number): PhysicalSize;
}
export declare class PhysicalSize {
    readonly width: number;
    readonly height: number;
    readonly type = "Physical";
    constructor(width: number, height: number);
    toLogical(scaleFactor?: number): LogicalSize;
    toPhysical(): PhysicalSize;
}
export type Position = LogicalPosition | PhysicalPosition;
export type Size = LogicalSize | PhysicalSize;
