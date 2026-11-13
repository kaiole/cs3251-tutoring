---
# tutoring
title: References and const
noteId: cpp-references-const
tags: [cpp, references, const]
date: 11-12-2026
---

## **References**

A reference is another name (alias) for an object that already exists.

- **MUST** be initialized
- can't be reseated (always refers to the same object)
- no null references

```cpp
int a = 1;
int b = 7;
int& r = a; // r is another name for a

r = b;      // does NOT make r refer to b
            // copies b's value INTO a -> a == 7
```

|                     | pointer         | reference       |
| ------------------- | --------------- | --------------- |
| can be null         | yes (`nullptr`) | no              |
| can point elsewhere | yes             | no              |
| must be initialized | no              | yes             |
| using it            | `*p`, `p->x`    | just `r`, `r.x` |

---

## **Passing parameters**

```cpp
void by_value(std::string s);            // copy. changes don't affect the caller
void by_ref(std::string& s);             // no copy. CAN modify the caller's string
void by_const_ref(const std::string& s); // no copy. can't modify
```

- cheap types (`int`, `double`, pointers, ...): by value
- big types you only read (`std::string`, `std::vector`, your classes):
  `const T&`
- you need to change the caller's object: `T&`

### **const refs can bind to temporaries, non-const refs can't**

```cpp
void shout(std::string& s);
void print(const std::string& s);

print("hi"); // ok: a temporary std::string is made and binds to the const ref
shout("hi"); // error: can't bind a non-const ref to a temporary
```

If `shout` modified a temporary that dies right after the call the change would
just be lost, which is almost always a bug. So the language doesn't allow it.

---

## **const**

### **Where does the const go?**

**Rule:** `const` applies to whatever is immediately to its **LEFT**. If there's
nothing on its left, it applies to what's on its right.

Easier way: read the declaration **right to left**.

```cpp
int x = 1;
int y = 2;

const int* p1 = &x;       // p1 is a pointer to an int that is const
int const* p2 = &x;       // SAME as p1
int* const p3 = &x;       // p3 is a const pointer to an int
const int* const p4 = &x; // p4 is a const pointer to a const int

*p1 = 5; // error: can't change the int through p1
p1 = &y; // ok: p1 itself can move

*p3 = 5; // ok: the int isn't const
p3 = &y; // error: p3 can't move
```

"pointer to const" really means **read only through this pointer**. It doesn't
make `x` const:

```cpp
const int* p = &x;
x = 100; // totally fine, x isn't const. p just can't be used to change it
```

### **const member functions**

`const` after the parameter list = the function promises not to modify the
object.

```cpp
class Counter {
public:
    int value() const { return value_; } // read only
    void increment() { ++value_; }

private:
    int value_ = 0;
};
```

A `const` object (or a `const&` to one) can **ONLY** call `const` member
functions.

**Example: the error everyone hits**

```cpp
class Student {
public:
    std::string name() { return name_; } // forgot const!

private:
    std::string name_;
};

void print(const Student& s) {
    std::cout << s.name(); // error
}
```

GCC:

```
error: passing 'const Student' as 'this' argument discards qualifiers [-fpermissive]
```

clang:

```
error: 'this' argument to member function 'name' has type 'const Student', but function is not marked const
```

Translation: `s` is const, `name()` isn't marked `const`, so the compiler can't
promise `name()` won't modify `s`. The fix is adding `const` to `name()` (it
doesn't modify anything), **NOT** removing `const` from the parameter.

If a member function doesn't modify the object, mark it `const`. Getters
basically always are.

### **Returning references**

```cpp
class Roster {
public:
    // no copy, and the caller can't modify our vector through it
    const std::vector<std::string>& names() const { return names_; }

private:
    std::vector<std::string> names_;
};
```

Never return a reference to a local, same problem as returning a pointer to a
local (see pointers note).
