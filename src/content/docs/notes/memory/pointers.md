---
title: Memory model and pointers
noteId: cpp-memory-pointers
tags: [cpp, memory, pointers]
date: 11-12-2026
---

## **Where things live**

- **Stack (automatic storage):** local variables + function params. Created
  when declared, destroyed automatically at the end of the scope `}`. Fast but
  limited in size.
- **Heap / free store (dynamic storage):** whatever you create w/ `new`. Lives
  until **YOU** `delete` it.
- **Static storage:** globals, `static` locals, `static` members. Live for the
  whole program.

```cpp
int global = 1;           // static storage

void f() {
    int local = 2;        // stack: destroyed when f returns
    static int calls = 0; // static: ONE copy, keeps its value between calls
    ++calls;

    int* p = new int(3);  // p itself is on the stack
                          // the int it points to is on the heap
    delete p;             // heap memory has to be freed by you
}                         // local and p destroyed here
```

The pointer and the thing it points to are **two separate objects** w/
separate lifetimes. When `p` goes away the heap `int` doesn't.

---

## **Pointers**

A pointer is just a variable that holds an address.

```cpp
int x = 5;
int* p = &x;      // p holds the address of x
*p = 10;          // go to that address and write 10 -> x is now 10

int* q = nullptr; // points at nothing. *q is UB
```

### **`*` and `&` mean different things depending on where they are**

| where                     | `*`                  | `&`            |
| ------------------------- | -------------------- | -------------- |
| in a **type/declaration** | "pointer to"         | "reference to" |
| in an **expression**      | dereference (follow) | address-of     |

```cpp
int x = 5;
int* p = &x; // decl: p is a pointer to int | expr: &x = address of x
int& r = x;  // decl: r is a reference to int (no address-of happening here)
int y = *p;  // expr: dereference p -> y = 5
```

Also:

```cpp
int* a, b;  // a is int*, b is just an int!!
int *c, *d; // both pointers
```

The `*` sticks to the name, not the type. One declaration per line avoids this.

### **Pointer arithmetic**

Adding 1 to a pointer moves it by **one element** (`sizeof(T)` bytes), not one
byte.

```cpp
int arr[3] = {10, 20, 30};
int* p = arr;            // array decays to a pointer to the first element

int second = *(p + 1);   // 20
int same = p[1];         // 20. p[i] is literally *(p + i)
```

---

## **new and delete**

They come in pairs:

- `new` ↔ `delete`
- `new[]` ↔ `delete[]`

Mixing them (`new[]` then `delete`) is UB.

`delete p` frees the memory but does **NOT** change `p`. It still holds the old
address, it's now a **dangling** pointer.

```cpp
int* p = new int(5);
delete p;
// p still holds the same address here
// *p = 6;   // UB: use after free
// delete p; // UB: double delete
p = nullptr; // some people do this so a 2nd delete is harmless (delete nullptr does nothing)
```

---

## **Common bugs**

1. **Memory leak:** losing the last pointer to heap memory before deleting it

```cpp
void leak() {
    int* p = new int[100];
    p = new int[100]; // first array is unreachable now, can never be freed
    delete[] p;
}
```

2. **Dangling pointer:** pointer to something that's already dead

```cpp
int* make() {
    int x = 42;
    return &x; // x is destroyed when make returns
}

int* p = make();
std::cout << *p; // UB. might even print 42, which makes it worse
```

Compilers warn about this one, turn warnings on (`-Wall -Wextra`).

3. **Use after delete / double delete:** see above

4. **Dereferencing `nullptr`:** usually a segfault but technically UB

UB doesn't mean crash. It can look like it works and then break on a different
machine/compiler/optimization level.

---

## **sizeof on arrays vs pointers**

When you pass an array to a function it
**<u>[decays](#user-content-fn-1)</u>**[^1] into a pointer. The size is gone.

[^1]:
    **decay:** implicit conversion of an array to a pointer to its first
    element. Happens almost any time you use an array's name in an expression.

```cpp
void f(int arr[]) {           // this is really: void f(int* arr)
    std::cout << sizeof(arr); // 8 on a 64 bit machine: size of the POINTER
}

int main() {
    int arr[10];
    std::cout << sizeof(arr); // 40 (10 * sizeof(int), int is usually 4 bytes)
    f(arr);
}
```

That's why C style functions always take a size too
(`void f(int* arr, std::size_t n)`). Or just use `std::vector`/`std::array`
which know their size.
