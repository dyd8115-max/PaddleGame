#pragma once
#include <cmath>

// 2차원 벡터 (위치, 속도 표현)
struct Vec2 {
    float x = 0.f;
    float y = 0.f;

    Vec2() = default;
    Vec2(float x_, float y_) : x(x_), y(y_) {}

    Vec2 operator+(const Vec2& o) const { return Vec2(x + o.x, y + o.y); }
    Vec2 operator-(const Vec2& o) const { return Vec2(x - o.x, y - o.y); }
    Vec2 operator*(float s) const { return Vec2(x * s, y * s); }
    Vec2& operator+=(const Vec2& o) { x += o.x; y += o.y; return *this; }

    float length() const { return std::sqrt(x * x + y * y); }
};

// 축 정렬 사각형 (모든 오브젝트의 충돌 영역이자 그리기 영역)
struct Rect {
    float x = 0.f, y = 0.f, w = 0.f, h = 0.f;

    Rect() = default;
    Rect(float x_, float y_, float w_, float h_) : x(x_), y(y_), w(w_), h(h_) {}

    float left() const { return x; }
    float right() const { return x + w; }
    float top() const { return y; }
    float bottom() const { return y + h; }
    float centerX() const { return x + w * 0.5f; }
    float centerY() const { return y + h * 0.5f; }

    bool intersects(const Rect& o) const {
        return left() < o.right() && right() > o.left() &&
               top() < o.bottom() && bottom() > o.top();
    }
};
