---
# tutoring
title: STL Iterators
noteId: cpp-iterators
---

## **STL**

The standard template library (STL) is a subset of the
**<u>[standard-library](#user-content-fn-1)</u>**[^1], and consists of the
**iterator**, **container**, **algorithm**, and **function object (functor)**
parts of the library.

[^1]:
    **standard-library:** the collection of facilities specified by the C++
    standard, including containers, algorithms, strings, input/output,
    threading, and more.

Iterators tell us our position in our container and let **algorithms** work with
different data structures without needing to know how each one stores its data.

**Example: Glue**

```cpp
#include <algorithm>
#include <vector>
#include <list>

// Dynamic array
std::vector<int> numbers_vector = {3, 1, 2};

// Doubly linked list
std::list<int> numbers_list = {3, 1, 2};

// Same algorithm, different data structures:
// Iterators act as the glue between data structure <-> algorithm
auto vector_it = std::find(numbers_vector.begin(), numbers_vector.end(), 2);
auto list_it = std::find(numbers_list.begin(), numbers_list.end(), 2);
```

**Example: Position not element**

```cpp
std::vector<int> numbers {5, 5};

auto a = numbers.begin();  // First element
auto b = a;               // Same position as a

bool same_position = (a == b);  // true

++b;  // Move b to the second element

same_position = (a == b);       // false: different positions
bool same_value = (*a == *b);   // true: both elements contain 5
```

---

## **Iterator Categories**

An iterator’s category tells you what operations it must support and what
guarantees it provides. There are **five traditional** categories; modern C++
also recognizes **contiguous iterators** (random-access iterators whose elements
are contiguous).

Categories describe minimum requirements, not a ban on additional operations.
Forward, bidirectional, and random-access iterators guarantee reading; writing
also depends on the iterator. For example, `const_iterator` and `std::set`
iterators cannot modify elements, while `std::map` iterators can modify mapped
values but not keys.

Movement must stay within the valid range, including the past-the-end position.
The past-the-end iterator (`end()`) must not be dereferenced.

The **provided by** lists give common examples, grouped by their strongest
iterator category.

### **Input iterators**

- support **FORWARD** iteration via `operator++` (prefix and postfix)
- **read** an element via `operator*` (this is called dereferencing)
- compare via `operator==` & `operator!=`
- provided by `std::istream_iterator`, constructed from a `std::istream`

**Example: Input Iterator**

```cpp
#include <iostream>
#include <iterator>

// std::cin is a part of the standard-library that can be used to construct
// std::istream_iterator (input iterator)
std::istream_iterator<int> input_it(std::cin);

// Construct end-of-stream iterator
std::istream_iterator<int> end_it;

while (input_it != end_it) {
    std::cout << *input_it << '\n'; // Access the current number
    ++input_it;                     // Read the next number
    // *input_it = 2;               // Won't compile read only access
}
```

### **Output iterators**

- support **FORWARD** iteration via `operator++` (prefix and postfix)
- **write** through the iterator via `*it = value`
- provided by:
  - `std::ostream_iterator`, constructed from a `std::ostream`
  - `std::back_insert_iterator`, `std::front_insert_iterator`, and
    `std::insert_iterator`, constructed for compatible containers

**Example: Output iterator**

```cpp
#include <iostream>
#include <iterator>

// https://en.cppreference.com/cpp/iterator/ostream_iterator/ostream_iterator
std::ostream_iterator<int> output_it(std::cout, " ");

*output_it = 10;  // Assignment writes to the stream
++output_it;      // No effect for std::ostream_iterator
*output_it = 20;

// int x = *output_it; // Won't compile write only access
```

### **Forward iterators**

- support **FORWARD** iteration via `operator++` (prefix and postfix)
- **read** an element by **_dereferencing_** (`operator*`); write if mutable
- if iterator points to a class object, we can use `operator->` to refer to a
  member
- compare via `==` and `!=`
- provided by `std::forward_list`, `std::unordered_map`,
  `std::unordered_multimap`, `std::unordered_set`, `std::unordered_multiset`

### **Bidirectional iterators**

- can iterate **BOTH FORWARD AND BACKWARD** via `operator++/--` (prefix and
  postfix)
- **read** and **write** (only if pointed to element is mutable) element by
  **_dereferencing_** (`operator*`)
- if iterator points to a class object, we can use `operator->` to refer to a
  member
- compare via `==` and `!=`
- provided by `std::list`, `std::map`, `std::multimap`, `std::set`,
  `std::multiset`

### **Random-access iterator**

- can iterate **BOTH FORWARD AND BACKWARD** via `operator++/--` (prefix and
  postfix)
- can jump multiple positions **BOTH FORWARD AND BACKWARD** via `operator+=/-=`
  ; also support `it + n` and `it - n`
- **read** and **write** (only if pointed to element is mutable) element by
  **_dereferencing_** (`operator*`)
- if iterator points to a class object, we can use `operator->` to refer to a
  member
- compare via `==`, `!=`, `<`, `<=`, `>`, `>=`
- provided by `std::vector`, `std::array`, `std::deque`, `std::string`, and
  pointers into built-in arrays

`std::stack`, `std::queue`, and `std::priority_queue` do not expose iterators.

## **Why aren't `operator+=/-=` required for bidirectional iterators?**

**Short answer:** The standard requires random-access iterators to support `+=`
and `-=` in `O(1)` time. Other iterator categories don’t guarantee constant-time
jumps, so these operators aren’t required for them.

**Example:**

Take a doubly linked list (`std::list`): each node points only to its immediate
neighbors, so moving forward by `n` positions requires following `n` links,
taking `O(n)` time.

In an array, elements occupy consecutive memory locations, so the destination
address can be calculated directly from the desired offset, taking `O(1)` time.
Random-access iterators expose this kind of efficient movement through
`it += n`.

Random access does **not** require contiguous storage: `std::deque` also
supports constant-time jumps, but its elements are not all stored contiguously.

## **Why aren't `operator</<=/>/>=` required for bidirectional iterators?**

Random-access iterators in the **same sequence** can determine their relative
positions in constant time, so `<`, `<=`, `>`, and `>=` compare where they are
in the sequence, not the values they point to.

For a linked list, node addresses don’t indicate sequence order. Determining
which node comes first generally requires following links, so its iterators
don’t provide these comparisons.
