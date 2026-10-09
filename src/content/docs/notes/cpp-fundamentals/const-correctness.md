---
title: Const correctness
noteId: cpp-const-correctness
topic: C++ fundamentals
description: Reading and writing const in declarations, parameters and member functions.
---

> Starter note — replace with your own content.

## Reading const declarations

Read declarations right to left: `const int* p` is "p is a pointer to a const int", while `int* const p` is "p is a const pointer to an int".

```cpp
int x = 0;
const int* p1 = &x;  // can't modify *p1, can reseat p1
int* const p2 = &x;  // can modify *p2, can't reseat p2
```

## Const member functions

A `const` member function promises not to modify the object, so it can be called on `const` objects.

```cpp
class Counter {
public:
    int value() const { return value_; }
    void increment() { ++value_; }
private:
    int value_ = 0;
};
```
