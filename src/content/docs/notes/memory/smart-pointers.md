---
title: Smart pointers
noteId: cpp-smart-pointers
tags: [cpp, smart_pointers, raii]
date: 11-12-2026
---

Smart pointers are RAII for heap memory: the destructor does the `delete` so
you don't have to (and can't forget, and an exception can't skip it). All in
`<memory>`.

## **unique_ptr**

**ONE** owner. When the `unique_ptr` is destroyed, the object it owns is
deleted.

```cpp
#include <memory>

auto p = std::make_unique<Widget>(1, 2); // Widget(1, 2) created on the heap
p->do_thing();
// no delete. freed when p goes out of scope
```

Prefer `std::make_unique<Widget>(1, 2)` over
`std::unique_ptr<Widget>(new Widget(1, 2))`.

### **Why can't I copy a unique_ptr?**

```cpp
auto a = std::make_unique<int>(5);
auto b = a;            // error: copy constructor is deleted
auto c = std::move(a); // ok: ownership moves to c, a is now nullptr
```

If copying were allowed you'd have 2 owners and both would `delete` the same
object → double free (same problem as the shallow copy in the big 3 note). So
copying is `= delete`d and you can only **move** (hand off) ownership.

Don't worry about how `std::move` works yet, that's the move semantics lecture.
For now: `std::move(a)` = "I'm giving `a` away, don't use it after this".

### **Passing to functions**

```cpp
void use(Widget& w);                  // just uses it. caller still owns it
void use_maybe(Widget* w);            // same but can be nullptr
void take(std::unique_ptr<Widget> w); // takes ownership

auto p = std::make_unique<Widget>(1, 2);
use(*p);
use_maybe(p.get()); // .get() = raw pointer, NON-owning. never delete it
take(std::move(p)); // p is empty after this
```

If a function doesn't care about ownership, don't make it take a smart pointer.

### **w/ polymorphism**

```cpp
std::unique_ptr<Animal> pet = std::make_unique<Dog>();
pet->speak(); // Woof (dynamic binding, see inheritance note)
```

`Animal` **NEEDS** a `virtual` destructor here, otherwise deleting a `Dog`
through an `Animal*` is UB.

---

## **shared_ptr**

**Shared** ownership. Keeps a reference count, the object is deleted when the
**last** `shared_ptr` to it is destroyed.

```cpp
auto a = std::make_shared<int>(5); // count = 1
{
    auto b = a;                    // copying is fine: count = 2
    std::cout << a.use_count();    // 2
}                                  // b destroyed: count = 1
std::cout << a.use_count();        // 1
// a destroyed -> count = 0 -> int deleted
```

### **Don't make 2 shared_ptrs from the same raw pointer**

```cpp
int* raw = new int(5);
std::shared_ptr<int> p1(raw);
std::shared_ptr<int> p2(raw); // separate count! both think they're the only owner
// both delete raw -> double free
```

Copy the `shared_ptr` instead (`auto p2 = p1;`). Just using `make_shared`
everywhere avoids this.

---

## **weak_ptr / cycles**

`shared_ptr`s can leak if objects point at each other:

```cpp
struct Node {
    std::shared_ptr<Node> next;
    std::shared_ptr<Node> prev;
};

{
    auto a = std::make_shared<Node>();
    auto b = std::make_shared<Node>();
    a->next = b; // b count = 2
    b->prev = a; // a count = 2
}
// a and b go out of scope: each count drops to 1, not 0
// a keeps b alive, b keeps a alive -> neither is ever deleted
```

Fix: make one direction a `std::weak_ptr`. A `weak_ptr` watches the object but
doesn't count as an owner.

```cpp
struct Node {
    std::shared_ptr<Node> next;
    std::weak_ptr<Node> prev; // doesn't add to the count
};

// using it:
if (auto p = node->prev.lock()) { // shared_ptr, or empty if it's already gone
    // p is safe to use in here
}
```

---

## **Which one?**

- default to `unique_ptr`
- `shared_ptr` only when ownership is actually shared (no one obvious owner)
- raw pointer / reference is fine for **non-owning** access
