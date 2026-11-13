---
title: STL Algorithms
noteId: cpp-stl-algorithms
tags: [cpp, stl, algorithms, ranges]
date: 11-12-2026
---

Mostly `<algorithm>`. `accumulate` and friends are in `<numeric>`.

## **Ranges are half open**

Algorithms take a pair of iterators `[first, last)`: `first` is included,
`last` is **NOT** (that's why `end()` is one past the last element).

```cpp
std::vector<int> v{5, 3, 8, 1};
std::sort(v.begin(), v.end());       // whole thing
std::sort(v.begin(), v.begin() + 2); // just the first 2
```

The algorithm only gets iterators, it never sees the container. So an
algorithm **can't** add or remove elements, it can only read/write/rearrange
through the iterators. Remember this for `remove` below.

Common ones:

- `find`, `find_if`: iterator to the first match, or `last` if nothing
- `count`, `count_if`
- `any_of`, `all_of`, `none_of`
- `sort`, `stable_sort`
- `copy`, `transform`
- `min_element`, `max_element`
- `accumulate` (`<numeric>`)

The `_if` versions take a **predicate** (function/functor/lambda that returns
`bool`).

```cpp
auto it = std::find_if(v.begin(), v.end(), [](int x) { return x > 4; });
if (it != v.end()) {
    std::cout << *it;
}
```

---

## **Why doesn't `std::remove` remove anything?**

```cpp
std::vector<int> v{1, 2, 3, 2, 4};
auto new_end = std::remove(v.begin(), v.end(), 2);

// v is now {1, 3, 4, ?, ?}
// v.size() is STILL 5
```

`remove` can't shrink the vector (it only has iterators, see above). What it
actually does: shifts the elements you want to **keep** to the front and
returns an iterator to the new logical end. Whatever is after `new_end` is
valid but unspecified.

You have to erase the tail yourself:

```cpp
v.erase(new_end, v.end()); // NOW size is 3: {1, 3, 4}

// usually written in one line (erase-remove idiom)
v.erase(std::remove(v.begin(), v.end(), 2), v.end());
```

C++20 finally made this one call:

```cpp
std::erase(v, 2);
std::erase_if(v, [](int x) { return x % 2 == 0; });
```

---

## **Copying into an empty vector**

```cpp
std::vector<int> src{1, 2, 3};
std::vector<int> dst;

std::copy(src.begin(), src.end(), dst.begin()); // UB: dst has 0 elements
```

`copy` just does `*out = value; ++out;` over and over. It doesn't know `dst` is
empty and it can't grow it. Same w/ `transform`.

```cpp
// calls dst.push_back(value) for each element
std::copy(src.begin(), src.end(), std::back_inserter(dst));

// OR make room first
dst.resize(src.size());
std::copy(src.begin(), src.end(), dst.begin());
```

`std::back_inserter` gives you a `std::back_insert_iterator` (one of the output
iterators from the iterators note).

---

## **Other gotchas**

### **`std::sort` needs random access iterators**

```cpp
std::list<int> lst{3, 1, 2};
std::sort(lst.begin(), lst.end()); // error: list iterators are only bidirectional
lst.sort();                        // use the member function
```

The error never just says "needs random access". It points into `stl_algo.h`
and says there's no `operator-` for `_List_iterator`. The hint is in the
`In instantiation of` line above it: `_RandomAccessIterator = _List_iterator<int>`.

### **`accumulate` uses the init value's type**

```cpp
std::vector<double> prices{1.5, 2.5, 3.25};
auto total = std::accumulate(prices.begin(), prices.end(), 0);    // int: 6
auto total2 = std::accumulate(prices.begin(), prices.end(), 0.0); // 7.25
```

w/ `0` the running total is an `int`, so it gets truncated after **every**
add: `0 + 1.5 → 1`, `1 + 2.5 → 3`, `3 + 3.25 → 6`.

### **Comparators have to be strict (`<` not `<=`)**

```cpp
std::sort(v.begin(), v.end(), [](int a, int b) { return a <= b; }); // UB
std::sort(v.begin(), v.end(), [](int a, int b) { return a < b; });  // ok
```

`sort` assumes `comp(a, a)` is `false` (**strict weak ordering**). `<=` breaks
that and `sort` can run past the end of the range and crash. Usually only once
the input is big enough, which makes it really annoying to debug.

---

## **Ranges (C++20)**

Range versions are in `std::ranges::` and take the container directly:

```cpp
std::ranges::sort(v);
auto it = std::ranges::find(v, 3);
```

They're constrained w/ concepts, so `std::ranges::sort(lst)` on a `std::list`
fails at the call instead of deep inside `stl_algo.h`. The error is still long
but it actually names the problem: `random_access_range` not satisfied.

### **Views are lazy**

```cpp
#include <ranges>

std::vector<int> v{1, 2, 3, 4, 5, 6};

auto evens_squared = v
    | std::views::filter([](int x) { return x % 2 == 0; })
    | std::views::transform([](int x) { return x * x; });

// nothing has been computed yet. no new vector was made

for (int x : evens_squared) {
    std::cout << x << ' '; // 4 16 36: filter/transform run here, one element at a time
}
```

A view doesn't own anything, it just refers to `v`. If `v` dies the view is
dangling, so don't return a view over a local vector from a function.
