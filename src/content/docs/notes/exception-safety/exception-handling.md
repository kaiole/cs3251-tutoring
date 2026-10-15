---
# tutoring
title: Exception Handling
noteId: cpp-exception-handling
---

## **RAII**

C++ technique that ties resource lifetime to an objects lifetime, relying on
constructors and destructors to manage them. Stands for **_Resource Acquisition
Is Initialization_**.

- Crucial to exception-safe resource management in C++.

---

## **Exceptions**

When a function cannot deal w/ a problem it can `throw` an
**<u>[exception](#user-content-fn-1)</u>**[^1] in hopes that its (direct or
indirect) caller can handle the problem.

A function indicates that it can handle that problem via a `catch` block for the
**corresponding exception**. That exception is specified in the catch clause.

```cpp
try {
  auto res = risky_task();

  // specifies what kind of error this block can handle
  // (...) means it can catch any type
} catch (error) {
  // handle exception
}

int risky_task() {
  // stuff
  if (success) {
    return stuff;
  } else {
    throw error;
  }
}
```

### **When NOT to use exceptions**

1. **Time-critical compoenents:** theres no tools that an accurately estimate
   the max time for an exception to propogate from a `throw` to a `catch`
2. **Legacy code w/ manual resource management:** just not as exception safe

---

## **Exception Guarantees**

An operation can be considered **exception-safe** if that operation leaves the
program in a **valid state** when the operation is terminated by throwing an
exception.

### **Valid state**

In the context of local variables

With objects, **<u>[invariants](#user-content-fn-2)</u>**[^2] are:

1. established by constructor
2. maintained by all functions that can modify its state until the object is
   destroyed

Therefore, a **valid state** is the point in which the constructor has completed
(so members and state have been initialized properly) and destructor has not yet
been entered.

- invariants can be language rules or just user defined class requirements

**Example: Language defined**

```cpp
class buffer {
public:
  buffer() = default;

private:
  int arr[32]{};
  std::size_t index = 0;
  std::size_t elements = 0;
};
```

Here the class MUST preserve `0 <= position <= 31` and `0 <= elements <= 32`

**Example: User defined**

```cpp
class rectangle {
public:
  rectangle(int w, int h) : width(w), height(h) {
    // should allow w == h because thats a square
  }

private:
  int width;
  int height;
};
```

### **Guarantees**

"If an exception occurs..."

- **No guarantee:** memory can be leaked, invariants of compoenents not
  preserved
- **Basic:** component invariants preserved & no resources are leaked but state
  may change
  - ex. **state change:** sorting a list and it throws halfway through; list
    still valid but the state is not the same and it's partially sorted
- **Strong:** the operation has no observable effect: “succeeds completely or
  change nothing.”
  - ex. sort a **copy** of the list, upon success, replace the original w/ the
    copy
  - this is called the **copy-and-swap** idiom
- "succeed **COMPLETELY** or change nothing"
- **No-throw guarantee:** no exception escapes the operation.
  - Declare this with `noexcept`.
  - Exceptions may be thrown internally and caught.
  - If an exception would escape a noexcept function, std::terminate is called.

---

## **Copy-swap-idom**

Copy OG obj that needs modification, modify the copy not the OG. If all is well
swap copy w/ OG object.

w/ complex types and objects that can throw, in order to guarantee strong
exception guarntee we **NEED** a non-throwing swap.

C++ provides `std::swap` which is only conditionally `noexcept`

The conditions are that the move constructor/assignmeng are `noexcept`. I don't
think you need to know this. Just know that `std::swap` is `noexcept` most of
the time and if you need to create your own swap, it should be `noexcept` for
**strong exception guarntee**.

### **TLDR**

Copying and mutating can be dangerous, as long as we can safely swap without
throwing (replace original w/ a copy) we can guarantee **strong exception
safety**.

---

## **Identifying dangerous/potentially throwing code**

1.  **Find operations that may throw:** function calls, constructors, overloaded
    operators, implicit conversions, `new`, and explicit `throw`.
2.  **Imagine execution stopping at each throwing point:** what state and
    resources have already changed?
3.  **Check the guarantee:** would resources leak, invariants break, or the
    original state remain unchanged?
4.  **Check cleanup:** destructors must not let exceptions escape during stack
    unwinding.

[^1]:
    **exception:** signals that an error or unusual condition has occurred. When
    thrown, it interrupts the normal flow of execution.

[^2]:
    **invariants:** properties that must remain true throughout a system’s valid
    operation. Every allowed action must preserve them.
