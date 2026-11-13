---
title: Stack unwinding
noteId: cpp-stack-unwinding
tags: [cpp, exceptions]
date: 11-12-2026
---

## **What happens when you throw**

1. the function stops right at the `throw`
2. C++ looks for a matching `catch` going **up** the call stack (caller,
   caller's caller, ...)
3. every function it leaves on the way gets its local objects destroyed
   (destructors run, reverse order of construction)
4. the `catch` block runs

Step 3 is **stack unwinding**. It's why RAII works: destructors still run even
when an exception skips the rest of the function.

**Example: trace it**

```cpp
#include <iostream>
#include <stdexcept>
#include <string>

struct Noisy {
    std::string name;

    explicit Noisy(const std::string& n) : name(n) {
        std::cout << "ctor " << name << '\n';
    }
    ~Noisy() { std::cout << "dtor " << name << '\n'; }
};

void c() {
    Noisy n("c");
    throw std::runtime_error("oops");
    std::cout << "never printed\n";
}

void b() {
    Noisy n("b");
    c();
    std::cout << "never printed either\n";
}

void a() {
    Noisy n("a");
    b();
}

int main() {
    try {
        a();
    } catch (const std::exception& e) {
        std::cout << "caught: " << e.what() << '\n';
    }
}
```

Output:

```
ctor a
ctor b
ctor c
dtor c
dtor b
dtor a
caught: oops
```

Destructors run **before** the catch block, newest object first.

---

## **Only objects get destroyed, not what they point to**

```cpp
void leaky() {
    int* data = new int[100];
    risky();       // throws -> unwinding destroys the POINTER data
    delete[] data; // never runs -> leak
}
```

A raw pointer doesn't have a destructor that frees anything. Use something that
owns the memory:

```cpp
void fine() {
    std::vector<int> data(100); // or std::make_unique<int[]>(100)
    risky();                    // throws -> vector's destructor frees it
}
```

---

## **Catch by const reference**

```cpp
try {
    throw std::runtime_error("oops");
} catch (std::exception e) { // by VALUE
    std::cout << e.what();   // NOT "oops", some generic message
}
```

Catching by value copies only the `std::exception` part of the `runtime_error`
(**slicing**, same thing as in the inheritance note), so `what()` ends up
calling `std::exception::what()`.

`catch (const std::exception& e)` keeps the real object → `e.what()` is
`"oops"`.

### **Order of catch blocks matters**

The **first** one that matches wins, not the best match.

```cpp
try {
    throw std::out_of_range("bad index");
} catch (const std::exception& e) {
    // catches EVERYTHING derived from std::exception, including out_of_range
} catch (const std::out_of_range& e) {
    // never reached
}
```

Most specific (most derived) type goes first. GCC/clang warn about this one.

---

## **Don't throw from destructors**

If a destructor throws **while** the stack is already unwinding from another
exception, there would be 2 exceptions in flight at once. C++ doesn't deal w/
that, it just calls `std::terminate` (program dies).

Also since C++11 destructors are `noexcept` by default, so an exception
escaping a destructor calls `std::terminate` even when nothing else is going
on. If cleanup can fail, catch it inside the destructor.

If nothing catches an exception at all → `std::terminate`. Whether the stack
gets unwound first in that case is up to the implementation, so don't count on
destructors running.
