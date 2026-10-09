---
title: References and pointers
noteId: cpp-references-pointers
topic: C++ fundamentals
description: How references and pointers differ, and when to use each.
---

> Starter note — replace with your own content. Keep the `noteId` once questions exist.

Both a reference and a pointer let you reach another object indirectly. They differ in what can change after they are created.

## Reference basics

A reference is another name for an existing object. It must be initialized, and every use of it is a use of the original object.

```cpp
int count = 1;
int& alias = count;   // alias names the same int as count

alias += 1;           // count is now 2
```

## Reference assignment

A reference cannot be reseated after initialization. Assigning to a reference assigns to the object it refers to.

```cpp
int a = 1;
int b = 7;
int& r = a;

r = b;      // copies b's value into a; r still refers to a
// a == 7, b == 7
```

## Pointer basics

A pointer is an object whose value is an address. It can be null, and it can be changed to point somewhere else.

```cpp
int a = 1;
int b = 7;
int* p = &a;

p = &b;     // p now points to b; a is unchanged
*p = 9;     // b == 9
```

## Choosing between them

- Use a reference for a parameter that must refer to an existing object, such as `const std::string&` to avoid a copy.
- Use a pointer when "no object" is a valid state, or when the target must change.
- Prefer smart pointers (`std::unique_ptr`, `std::shared_ptr`) over raw owning pointers.
