---
# tutoring
title: STL Containers
noteId: cpp-stl-containers
tags: [cpp, stl, containers]
date: 11-12-2026
---

## **Overview**

**Sequence** (you decide the order)

- `std::vector`: dynamic array. Use this by default
- `std::deque`: fast push/pop at **both** ends
- `std::list`: doubly linked list. fast insert/erase anywhere **if you already
  have an iterator there**
- `std::array`: fixed size, no heap

**Associative** (sorted by key, `O(log n)`, usually a red-black tree)

- `std::set`, `std::map`, `std::multiset`, `std::multimap`

**Unordered** (hash table, average `O(1)`, no order)

- `std::unordered_set`, `std::unordered_map`, ...

**Adapters** (wrap another container, restricted interface, no iterators)

- `std::stack`, `std::queue`, `std::priority_queue`

`std::list` is usually slower than `vector` in practice even when the big O
looks better, b/c `vector` is contiguous (cache friendly) and every list node
is a separate allocation.

---

## **vector: size vs capacity**

- **size:** how many elements are actually in it
- **capacity:** how many fit before it has to reallocate

When `push_back` runs out of capacity, `vector` allocates a bigger buffer
(~1.5-2x), moves everything over, and frees the old one.

```cpp
std::vector<int> v;
v.reserve(10);  // capacity >= 10, size is still 0
// v[0] = 1;    // UB!! there is no element 0. reserve doesn't create elements
v.push_back(1); // ok

std::vector<int> w;
w.resize(10);   // size == 10, all elements are 0
w[0] = 1;       // ok
```

- `reserve`: "I'm about to add a bunch, allocate once"
- `resize`: actually creates/removes elements

`v[i]` doesn't check bounds, `v.at(i)` does (throws `std::out_of_range`).

---

## **map: `operator[]` inserts**

```cpp
std::map<std::string, int> ages{{"alice", 20}};

if (ages["bob"] == 0) { /* ... */ }
// "bob" wasn't there -> operator[] INSERTED {"bob", 0}
// ages.size() is now 2
```

`operator[]` returns a reference to the value, so if the key isn't there it has
to create one to return.

To just check:

```cpp
if (ages.contains("bob")) { /* ... */ }  // C++20
if (ages.count("bob") > 0) { /* ... */ } // older

auto it = ages.find("bob");
if (it != ages.end()) {
    std::cout << it->second; // it->first is the key
}
```

Also b/c it can insert, `operator[]` isn't `const` → doesn't work on a
`const std::map&` (see const member functions in the references & const note).
Use `.at()` (throws if missing) or `.find()`.

```cpp
void print_age(const std::map<std::string, int>& ages) {
    std::cout << ages["alice"];    // error
    std::cout << ages.at("alice"); // ok
}
```

---

## **Iterator invalidation**

An iterator (or pointer/reference) to an element gets **invalidated** when the
container changes in a way that moves or removes that element. Using it after
that is UB.

### **vector**

- `push_back`/`insert` that causes a **reallocation** → **EVERYTHING** is
  invalidated (all the elements moved to a new buffer)
- `push_back` w/o reallocation → only `end()`
- `insert`/`erase` in the middle → everything **at or after** that position

**Example: reference into a vector**

```cpp
std::vector<int> v{1, 2, 3};
int& first = v[0];
v.push_back(4);     // might reallocate
std::cout << first; // UB if it did: first still refers to the OLD buffer
```

Same w/ `for (int x : v) { v.push_back(x); }`. Range-for holds iterators to `v`
the whole time.

**Example: erasing in a loop**

```cpp
std::vector<int> v{1, 2, 3, 4, 5, 6};

// WRONG
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it % 2 == 0) {
        v.erase(it); // it is invalid now, then the loop does ++it -> UB
    }
}

// RIGHT
for (auto it = v.begin(); it != v.end(); /* no ++ here */) {
    if (*it % 2 == 0) {
        it = v.erase(it); // erase returns an iterator to the element AFTER the erased one
    } else {
        ++it;
    }
}
```

Or skip the loop: `std::erase_if(v, [](int x) { return x % 2 == 0; });` (C++20,
see algorithms note).

### **list / set / map**

Node based, elements never move. Inserting doesn't invalidate anything. Erasing
only invalidates iterators to the **erased** element (so the
`it = c.erase(it)` loop still applies).

### **unordered\_\***

Inserting can cause a **rehash** → all iterators invalidated (references and
pointers to elements are still fine though). Erasing only invalidates the
erased element.
