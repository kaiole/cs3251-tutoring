---
title: Classes and the big 3
noteId: cpp-classes-big-three
tags: [cpp, classes, big_three]
date: 11-12-2026
---

## **Access specifiers**

- **`public`:** anyone can use it
- **`protected`:** the class itself + derived classes
- **`private`:** only the class itself (and its friends)

`struct` and `class` are the **SAME** thing except for the default:

- `struct` members are `public` by default
- `class` members are `private` by default

### **friend**

A class can give a function or another class access to its `private` and
`protected` members by declaring it a `friend`.

```cpp
class Account {
    friend void audit(const Account& acc); // audit can see balance_
    friend class Bank;                     // every member of Bank can too

private:
    double balance_ = 0;
};

void audit(const Account& acc) {
    std::cout << acc.balance_ << '\n'; // ok: audit is a friend
}
```

Friendship is:

- **not inherited:** a class derived from `Bank` is not a friend of `Account`
- **not mutual:** `Account` gets nothing extra from `Bank`
- **not transitive:** a friend of `Bank` is not a friend of `Account`

---

## **The big 3**

1. destructor
2. copy constructor
3. copy assignment operator

If you don't write them the compiler generates them for you. The generated
versions just copy/destroy each member one by one (**memberwise**), which is
fine for `int`, `std::string`, `std::vector`, etc.

**Rule of 3:** if your class needs a custom version of **ONE** of these, it
probably needs **ALL THREE**.

Usually that's b/c the class owns a resource (`new`'d memory, a file handle,
...) and memberwise copying a raw ptr copies the **address**, not the thing it
points to.

**Example: what goes wrong**

```cpp
class IntArray {
public:
    explicit IntArray(std::size_t size) : size_(size), data_(new int[size]{}) {}
    ~IntArray() { delete[] data_; }

    // no copy ctor / copy assignment written -> compiler generates them

private:
    std::size_t size_;
    int* data_;
};

int main() {
    IntArray a(10);
    IntArray b = a; // generated copy ctor copies the POINTER: a.data_ == b.data_
}   // b destroyed -> delete[] data_
    // a destroyed -> delete[] the SAME data_ again -> UB (double free)
```

This is a **shallow copy**. We want a **deep copy**: `b` gets its own array w/
the same values in it.

**Example: the fix**

```cpp
#include <algorithm>
#include <cstddef>
#include <utility>

class IntArray {
public:
    explicit IntArray(std::size_t size) : size_(size), data_(new int[size]{}) {}

    // 1. destructor
    ~IntArray() { delete[] data_; }

    // 2. copy constructor: make our OWN array and copy the values over
    IntArray(const IntArray& other)
        : size_(other.size_), data_(new int[other.size_]) {
        std::copy(other.data_, other.data_ + other.size_, data_);
    }

    // 3. copy assignment: copy-and-swap
    IntArray& operator=(IntArray other) { // by value -> other is already a copy
        swap(*this, other);
        return *this;
    } // other now holds our OLD array and deletes it here

    friend void swap(IntArray& a, IntArray& b) noexcept {
        using std::swap;
        swap(a.size_, b.size_);
        swap(a.data_, b.data_);
    }

private:
    std::size_t size_;
    int* data_;
};
```

Same copy-and-swap idea from the exception handling note: do the part that can
throw (the copy) first, then swap, which can't throw.

---

## **Copy ctor vs copy assignment: which one runs?**

The `=` sign does **NOT** mean assignment.

```cpp
IntArray a(3);
IntArray b = a; // copy CONSTRUCTOR: b is being created on this line
IntArray c(a);  // copy constructor

IntArray d(5);
d = a;          // copy ASSIGNMENT: d already exists
```

Ask: **is the object on the left being created on this line?**

- yes → constructor
- no → assignment operator

Assignment is the harder one to write b/c the object already has stuff in it
(its old array) that has to be cleaned up. A constructor starts from nothing.

The copy ctor also runs when you pass by value. Returning by value _can_ run it
too but the compiler is usually allowed to skip that copy (**copy elision**),
so don't count on seeing a print statement from it.

### **Why not just delete and copy?**

The "obvious" copy assignment:

```cpp
IntArray& operator=(const IntArray& other) {
    delete[] data_;          // free our old array
    size_ = other.size_;
    data_ = new int[size_];
    std::copy(other.data_, other.data_ + size_, data_);
    return *this;
}
```

Two problems:

1. **self assignment:** `a = a;` deletes `data_`, which is **also**
   `other.data_`, then copies out of freed memory. UB.
2. if `new` throws, `data_` was already deleted but still points at the freed
   memory. The destructor will delete it again later. Not even the basic
   guarantee.

copy-and-swap fixes both: the copy happens before we touch anything, and
swapping w/ yourself is harmless.

---

## **explicit**

A constructor that can be called w/ one argument is also an **implicit
conversion**.

```cpp
class IntArray {
public:
    IntArray(std::size_t size); // NOT explicit
    // ...
};

void print(const IntArray& arr);

print(5);       // compiles!! makes a temporary IntArray of size 5
IntArray a = 5; // also compiles
```

Probably not what anyone wanted. Mark it `explicit`:

```cpp
explicit IntArray(std::size_t size);

print(5);           // error
IntArray a = 5;     // error
IntArray b(5);      // ok
print(IntArray(5)); // ok, you asked for it
```

Single arg constructors should be `explicit` unless you actually want the
conversion (ex. `std::string` from `const char*` is on purpose).

---

There's also the rule of 5 (adds move ctor + move assignment) but that's the
move semantics lecture at the end. If you use `std::vector`/`std::unique_ptr`
instead of raw ptrs you usually don't need to write **any** of these (**rule
of 0**).
