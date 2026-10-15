---
title: Inheritance and polymorphism
noteId: cpp-inheritance-polymorphism
tags: [cpp]
date: 10-13-2026
---

## **Construction/destruction order**

### **Construction**

1.  Virtual base classes
2.  Direct non-virtual bases
3.  Data members
4.  Constructor body

### **Destruction**

1. Destructor body
2. Data members
3. Direct non-virtual bases
4. Virtual base classes

---

## **Virtual**

- tells the compiler that the method can be overridden by children classes
- implementation can be selected at run-time based on the objects actual type

---

## **Abstract types**

A class with at **LEAST** one
**<u>[pure virtual function](#user-content-fn-1)</u>**[^1] and has no non-pure
final overrides.

```cpp
struct A {
   virtual void f() = 0;
};

struct B : A {
   // No override: f() is still pure virtual.
}; // B is abstract

struct C : B {
   void f() override {}
}; // C is concrete: its override is not pure virtual
``
```

---

## **Representation**

Consumers of the abstract class use its interface without knowing how the data
is stored, since the interface hides those implementation details. They cannot
create an abstract-class object directly and must instead access a concrete
implementation through a pointer or reference.

---

## **Static binding vs dynamic binding**

**Binding:** the association between name or call and the code or data that it
refers to

### **Static binding**

The function is selected at compile time based on the expression's declared
type.

**Example: static binding**

```cpp
struct Animal {
    void speak() { std::cout << "Animal\n"; }
};

struct Dog : Animal {
    void speak() { std::cout << "Woof\n"; }
};

int main() {
    Dog dog;
    Animal& animal = dog;

    dog.speak();    // Woof: dog has declared type Dog
    animal.speak(); // Animal: animal has declared type Animal&
}
```

`Dog::speak` hides the non-virtual `Animal::speak`; it does not override it.

Since the types are concrete, the compiler knows exactly which function we are
talking about and knows the memory address where the code for them lives and can
perform **static binding** (essentially hardcodes a jump instruction to that
specific mem address).

### **Dynamic binding**

A virtual call selects the override at runtime based on the actual object's
type.

**Example: dynamic binding**

```cpp
struct Animal {
    virtual void speak() { std::cout << "Animal\n"; }
    virtual ~Animal() = default;
};

struct Dog : Animal {
    void speak() override { std::cout << "Woof\n"; }
};

int main() {
    Dog dog;
    // Animal animal = dog; // Copies only the Animal portion of dog
    Animal& animal = dog;
    // OR
    Animal* ptr = &dog;

    dog.speak();    // Woof
    animal.speak(); // Woof: the actual object is a Dog
}
```

Using a base reference (or pointer) preserves the derived object. Copying it
into an `Animal` value would slice off the `Dog` part.

Since `speak()` is now virtual, the compiler can no longer hard code a jump to
`speak()` since theres a chance that it might be overridden. Thus, the compiler
is forced to use **dynamic binding** since it cannot know the address of the
function at compile time.

Compiler will then generate code that will look up the address later at runtime.

This is where the overhead comes from.

---

## **V-pointers and V-tables**

### **V-pointer**

Compiler silently inserts a hidden field in every instance of the class as the
very first member. This member is known as the **v-pointer** and is what allows
the code to find the correct function at runtime.

Where does it point to?

### **V-table**

The **v-tables** themselves live in static RO memory and there is **ONLY ONE**
v-table per class.

You visualize **v-tables** as a simple array of function pointers.

sources: https://youtu.be/sAZ6JvLPx_0?si=ILcLDcaSPuWs4NpC

### **Abstract classes**

Abstract classes still need a **v-table** to support virtual dispatch.
Typically, a pure virtual function’s slot points to a runtime error handler.
However this is implementation defined.

### **UB**

Calling a pure virtual function virtually during construction or destruction is
UB.

---
