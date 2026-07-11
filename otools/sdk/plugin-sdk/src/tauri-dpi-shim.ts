export class LogicalPosition {
  readonly type = "Logical";

  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  toLogical(): LogicalPosition {
    return this;
  }

  toPhysical(scaleFactor = 1): PhysicalPosition {
    return new PhysicalPosition(
      Math.round(this.x * scaleFactor),
      Math.round(this.y * scaleFactor),
    );
  }
}

export class PhysicalPosition {
  readonly type = "Physical";

  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  toLogical(scaleFactor = 1): LogicalPosition {
    return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
  }

  toPhysical(): PhysicalPosition {
    return this;
  }
}

export class LogicalSize {
  readonly type = "Logical";

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {}

  toLogical(): LogicalSize {
    return this;
  }

  toPhysical(scaleFactor = 1): PhysicalSize {
    return new PhysicalSize(
      Math.round(this.width * scaleFactor),
      Math.round(this.height * scaleFactor),
    );
  }
}

export class PhysicalSize {
  readonly type = "Physical";

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {}

  toLogical(scaleFactor = 1): LogicalSize {
    return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
  }

  toPhysical(): PhysicalSize {
    return this;
  }
}

export type Position = LogicalPosition | PhysicalPosition;
export type Size = LogicalSize | PhysicalSize;
