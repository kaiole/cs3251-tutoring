---
# tutoring
title: STL Iterators
noteId: cpp-iterators
---

## **Background**

> [!NOTE] STL
>
> The standard template library (STL) is a subset of the
> **standard-library**[^1], and consists of the **iterator**, **container**,
> **algorithm**, and **function object (functor)** parts of the library.

[^1]:
    **standard-library:** the collection of facilities specified by the C++
    standard, including containers, algorithms, strings, input/output,
    threading, and more.

- Iterators are the mechanism that minimize an **algorithms** dependence on the
  data structure its operating on.
- Helps "glue" the standard-library **algorithms** to their data.

**Example:**

Algorithms usually take pairs of iterators as parameters.

```cpp
#include <algorithm>
#include <vector>

std::vector<int> numbers{4, 1, 3, 2};

// Look for 2 in numbers
auto it = find(numbers.begin(), numbers.end(), 2);

std::sort(numbers.begin(), numbers.end());
// numbers is now {1, 2, 3, 4}
```

---

## **Iterator Categories**

An iterator’s category tells you what operations it supports and what guarantees
it provides. There are **five** categories:

**Input iterator:** allows us to:

- iterate forward via `operator++` (prefix and postfix)
- compare via `operator==` & `operator!=`
- access an element via `operator*`

> [!DANGER] element access via
