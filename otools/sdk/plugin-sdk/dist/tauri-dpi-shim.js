class s {
  constructor(t, i) {
    this.x = t, this.y = i, this.type = "Logical";
  }
  toLogical() {
    return this;
  }
  toPhysical(t = 1) {
    return new o(
      Math.round(this.x * t),
      Math.round(this.y * t)
    );
  }
}
class o {
  constructor(t, i) {
    this.x = t, this.y = i, this.type = "Physical";
  }
  toLogical(t = 1) {
    return new s(this.x / t, this.y / t);
  }
  toPhysical() {
    return this;
  }
}
class r {
  constructor(t, i) {
    this.width = t, this.height = i, this.type = "Logical";
  }
  toLogical() {
    return this;
  }
  toPhysical(t = 1) {
    return new n(
      Math.round(this.width * t),
      Math.round(this.height * t)
    );
  }
}
class n {
  constructor(t, i) {
    this.width = t, this.height = i, this.type = "Physical";
  }
  toLogical(t = 1) {
    return new r(this.width / t, this.height / t);
  }
  toPhysical() {
    return this;
  }
}
export {
  s as LogicalPosition,
  r as LogicalSize,
  o as PhysicalPosition,
  n as PhysicalSize
};
//# sourceMappingURL=tauri-dpi-shim.js.map
