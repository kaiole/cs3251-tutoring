---
title: Templates
noteId: cpp-templates
tags: [cpp, templates]
date: 11-12-2026
---

## **What is a template**

A blueprint for a function or class. It's not real code until you use it w/ a
type, then the compiler generates a version for that type. This is called
**<u>[instantiation](#user-content-fn-1)</u>**[^1].

[^1]:
    **instantiation:** the compiler generating an actual function/class from a
    template by filling in the template parameters (ex. `max_of<int>`).

```cpp
template <typename T>
T max_of(T a, T b) {
    return a < b ? b : a;
}

max_of(3, 7);           // compiler generates max_of<int>
max_of(2.5, 1.0);       // generates max_of<double>
max_of<double>(3, 7.5); // T given explicitly
```

- `typename` and `class` mean the **same** thing in `template <typename T>` /
  `template <class T>`
- `T` has to support whatever the template does w/ it. `max_of` uses `<`, so
  calling it on a type w/o `operator<` won't compile

### **Deduction has to agree**

```cpp
max_of(3, 7.5); // error: T is int from 3 but double from 7.5 -> conflict
```

No implicit conversions while deducing `T`. Fix: `max_of<double>(3, 7.5)` or
`max_of(3.0, 7.5)`.

---

## **Class templates**

```cpp
template <typename T>
class Stack {
public:
    void push(const T& value) { items_.push_back(value); }
    void pop() { items_.pop_back(); }
    const T& top() const { return items_.back(); }
    bool empty() const { return items_.empty(); }

private:
    std::vector<T> items_;
};

Stack<int> ints;
Stack<std::string> words;
```

`Stack<int>` and `Stack<std::string>` are **different types**, they just came
from the same blueprint.

Defining a member outside the class needs the `template` line again:

```cpp
template <typename T>
void Stack<T>::push(const T& value) {
    items_.push_back(value);
}
```

### **Non-type template params**

Template params don't have to be types:

```cpp
template <typename T, std::size_t N>
class FixedArray {
public:
    std::size_t size() const { return N; }
    T& operator[](std::size_t i) { return data_[i]; }

private:
    T data_[N];
};

FixedArray<int, 5> a; // N has to be known at compile time
```

Basically how `std::array<T, N>` works. `FixedArray<int, 5>` and
`FixedArray<int, 6>` are different types.

---

## **Why do templates have to go in the header?**

**The error:**

```
undefined reference to `Stack<int>::push(int const&)'
```

You get this if you split a template into `.h`/`.cpp` like a normal class:

```cpp
// Stack.h
template <typename T>
class Stack {
public:
    void push(const T& value);
    // ...
};

// Stack.cpp
#include "Stack.h"

template <typename T>
void Stack<T>::push(const T& value) { /* ... */ }

// main.cpp
#include "Stack.h"

int main() {
    Stack<int> s;
    s.push(1); // linker error
}
```

**Why:** each `.cpp` file is compiled **separately**.

1. compiling `Stack.cpp`: there's a template but nothing in this file uses
   `Stack<int>`, so no code gets generated. Templates aren't code yet.
2. compiling `main.cpp`: needs `Stack<int>::push`, but it only sees the
   declaration from `Stack.h`, not the body, so it **can't** generate it. It
   assumes some other file has it and leaves it for the linker.
3. linking: nobody ever generated `Stack<int>::push` → undefined reference.

The compiler has to see the **full definition** wherever you use the template
w/ a type.

**Fixes:**

- put everything in the header (what basically everyone does)
- or explicitly instantiate the types you need at the bottom of `Stack.cpp`:
  `template class Stack<int>;`. Only works if you know every type ahead of time

Some people put the definitions in a `.tpp` file and `#include` it at the
bottom of the header. Same thing, just organized differently.

---

## **Specialization**

Sometimes the generic version is wrong (or slow) for one specific type, so you
write a separate version just for that type.

**Full specialization:** every template param is filled in

```cpp
template <typename T>
struct TypeName {
    static std::string get() { return "unknown"; }
};

template <>
struct TypeName<int> {
    static std::string get() { return "int"; }
};

TypeName<double>::get(); // "unknown"
TypeName<int>::get();    // "int"
```

**Partial specialization:** only part of it is filled in / matches a pattern.
**Classes only.**

```cpp
template <typename T>
struct TypeName<T*> { // any pointer type
    static std::string get() { return TypeName<T>::get() + "*"; }
};

TypeName<int*>::get();  // "int*"
TypeName<int**>::get(); // "int**"
```

Function templates **can't** be partially specialized. Overload instead:

```cpp
template <typename T>
void describe(T value); // general

template <typename T>
void describe(T* ptr);  // overload for pointers (NOT a specialization)
```

`std::vector<bool>` is a famous (infamous) specialization. It packs the bools
into bits, so `v[0]` doesn't give you a real `bool&`.

---

## **Reading template errors**

They're long. Tips:

- read the **first** error, the rest are usually fallout from it
- find the `required from here` line (clang says `requested here`), that's the
  line in **your** code that triggered it
- most of the time `T` just doesn't support something the template does (ex.
  no `operator<`)
