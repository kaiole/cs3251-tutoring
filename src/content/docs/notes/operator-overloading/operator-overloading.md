---
title: Operator overloading
noteId: cpp-operator-overloading
tags: [cpp, operator_overloading]
date: 10-14-2026
---

## **Binary vs unary operators**

**Arity:** number of arguments/operands an operation or function takes

- **Unary(1):** `++/--` (postfix + prefix), `+/-`, `!`, `~`, `*` (dereference),
  `&` (address-of), `sizeof`, `alignof`, `noexcept`, `co_await`
- **Binary(2):** `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`,
  `<=>`, `&&`, `||`, `&`, `|`, `^`, `<<`, `>>`, `=`, `+=`, `-=`, `*=`, `/=`,
  `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`, `,`, `.`, `->`, `.*`, `->*`, `[]`
  (ordinary subscripting)
- **Ternary(3):** `?:` (conditional: `condition ? a : b`)

---

## **Membership**

An overloaded operator can be a **member** or **non-member** function.

- **Member:** the left operand is `*this`. Unary operators take no explicit
  operands; binary operators take one.
- **Non-member:** all operands are explicit parameters: one for unary, two for
  binary. A `friend` operator is still a non-member.

```cpp
T T::operator-() const;             // member: -a
T operator-(const T& a);            // non-member: -a
T T::operator+(const T& rhs) const; // member: a + b
T operator+(T lhs, const T& rhs);   // non-member: a + b
```

**Preferred choices:**

- Use **members** for assignment (`=`), compound assignment (`+=`, etc.), and
  usually increment/decrement (`++`, `--`).
- Use **non-members** for arithmetic and comparisons: both operands can undergo
  implicit conversion. Hidden friends (defined with `friend` inside the class)
  are a common choice.
- Stream operators (`<<`, `>>`) are **non-members** because the stream is the
  left operand.
- `=`, `[]`, `()`, and `->` **must be members**.

**Exception:** postfix `++`/`--` take an extra dummy `int` parameter to
distinguish them from prefix; they are still unary operators.

---
