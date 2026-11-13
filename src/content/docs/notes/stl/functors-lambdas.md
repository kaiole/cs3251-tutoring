---
title: Functors and lambdas
noteId: cpp-functors-lambdas
tags: [cpp, functors, lambdas]
date: 11-12-2026
---

## **Functors (function objects)**

An object of a class that overloads `operator()`, so you can call it like a
function.

```cpp
struct GreaterThan {
    int threshold;

    bool operator()(int x) const { return x > threshold; }
};

GreaterThan gt5{5};
gt5(7); // true: really gt5.operator()(7)
gt5(3); // false

std::vector<int> v{1, 6, 8, 3};
auto n = std::count_if(v.begin(), v.end(), GreaterThan{5}); // 2
```

Why not just a function? A functor can carry **state** (`threshold` here). A
plain function would need the 5 hardcoded or a global.

Also algorithms are templates, so the compiler knows exactly which
`operator()` gets called and can inline it. A function pointer is harder for
it to inline.

Some come w/ the STL in `<functional>`: `std::less<>`, `std::greater<>`,
`std::plus<>`, ...

```cpp
std::sort(v.begin(), v.end(), std::greater<>{}); // descending
```

---

## **Lambdas**

Shorthand for writing a functor inline.

```cpp
[captures](params) -> return_type { body }
```

Return type is optional (deduced) most of the time.

```cpp
int threshold = 5;
auto n = std::count_if(v.begin(), v.end(), [threshold](int x) { return x > threshold; });
```

### **What a lambda actually is**

The compiler turns every lambda into a class w/ an `operator()`. Captures
become member variables. So these are basically the same:

```cpp
int threshold = 5;

auto gt = [threshold](int x) { return x > threshold; };

// roughly what the compiler generates:
class SomeUniqueName {
public:
    SomeUniqueName(int t) : threshold(t) {}
    bool operator()(int x) const { return x > threshold; } // const by default!

private:
    int threshold;
};
auto gt2 = SomeUniqueName{threshold};
```

A lambda **is** a functor. Everything below makes more sense if you picture
this class.

Every lambda gets its own unique class, even 2 w/ the exact same code. That's
why you store them in `auto` (you can't write the type). If you need one type
for "anything callable w/ this signature" (ex. a vector of callbacks), use
`std::function`:

```cpp
std::vector<std::function<int(int)>> ops;
ops.push_back([](int x) { return x + 1; });
ops.push_back([](int x) { return x * 2; });
```

`std::function` has overhead (can allocate, harder to inline), so only use it
when you actually need it.

### **Captures**

- `[x]`: copy `x`
- `[&x]`: reference to `x`
- `[=]`: copy everything used in the body
- `[&]`: reference everything used in the body
- `[this]`: use members inside a member function
- mixing: `[=, &total]`, `[&, x]`

**Copies happen when the lambda is CREATED, not when it's called**

```cpp
int x = 1;
auto by_val = [x] { return x; };
auto by_ref = [&x] { return x; };

x = 100;
by_val(); // 1: copied back when by_val was made
by_ref(); // 100
```

### **mutable**

`operator()` is `const` (look at the class above), so you can't modify by-value
captures:

```cpp
int count = 0;
auto inc = [count]() { ++count; };          // error: count is read-only
auto inc2 = [count]() mutable { ++count; }; // ok but changes the lambda's OWN copy

inc2();
inc2();
// count out here is still 0
```

If you want to change the outside variable, capture by reference.

### **Dangling reference captures**

```cpp
auto make_counter() {
    int count = 0;
    return [&count]() { return ++count; }; // count dies when make_counter returns
}

auto counter = make_counter();
counter(); // UB: refers to a dead local
```

Same problem as returning a pointer/reference to a local. If the lambda
**outlives** the scope, capture by value:

```cpp
auto make_counter() {
    int count = 0;
    return [count]() mutable { return ++count; }; // lambda has its own count
}
```

Same thing w/ `[this]`: if the lambda outlives the object, `this` dangles.

### **Generic lambdas**

`auto` params make `operator()` a template:

```cpp
auto print = [](const auto& x) { std::cout << x << '\n'; };
print(1);
print("hi");
```
