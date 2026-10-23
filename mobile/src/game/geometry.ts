// 2차원 벡터와 축 정렬 사각형 (PC 버전 Geometry.h 와 같음)

export class Vec2 {
  constructor(public x = 0, public y = 0) {}

  add(o: Vec2): Vec2 { return new Vec2(this.x + o.x, this.y + o.y); }
  scale(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
  length(): number { return Math.hypot(this.x, this.y); }
}

export class Rect {
  constructor(public x = 0, public y = 0, public w = 0, public h = 0) {}

  get left(): number { return this.x; }
  get right(): number { return this.x + this.w; }
  get top(): number { return this.y; }
  get bottom(): number { return this.y + this.h; }
  get centerX(): number { return this.x + this.w * 0.5; }
  get centerY(): number { return this.y + this.h * 0.5; }

  intersects(o: Rect): boolean {
    return this.left < o.right && this.right > o.left &&
           this.top < o.bottom && this.bottom > o.top;
  }

  contains(px: number, py: number): boolean {
    return px >= this.left && px <= this.right && py >= this.top && py <= this.bottom;
  }
}
