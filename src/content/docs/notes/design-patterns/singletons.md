---
title: Singletons
noteId: cpp-singletons
tags: [cpp, design_patterns, singleton]
date: 10-14-2026
---

## **Use case scenario**

Use when...

- You want to ensure that a class has **ONLY ONE** instance throughout an
  application and provides a global point of access to that instance.
- The sole instance should support extension through subclassing (inheritance),
  and clients should be able to use a subclass instance without changing their
  own code.

"Centralize access to global resources"

- ex. cli flags, application settings, loggers

## Modern C++

```cpp
class Singleton {
public:
    static Singleton& instance() {
        // Manual alternative (object is never deleted):
        // static Singleton* object = nullptr;
        // if (object == nullptr) object = new Singleton;
        // return *object;

        static Singleton object; // Created on first call; destroyed at shutdown.
        return object;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
    Singleton(Singleton&&) = delete;
    Singleton& operator=(Singleton&&) = delete;

    void do_work() {
        // ...
    }

private:
    Singleton() = default;
    ~Singleton() = default;
};
```

## Extending through subclassing

One access point returns a selected subclass through the base interface.

```cpp
class Singleton {
public:
    static Singleton& instance();
    virtual void do_work() = 0;

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;
    Singleton(Singleton&&) = delete;
    Singleton& operator=(Singleton&&) = delete;

protected:
    Singleton() = default; // Allow subclasses to construct the base.
    virtual ~Singleton() = default;
};

class ConcreteSingleton final : public Singleton {
    // Allow the base's accessor to use our private constructor/destructor.
    // Inheritance alone does not grant that access.
    friend class Singleton;

public:
    void do_work() override {
        // Implementation...
    }

private:
    ConcreteSingleton() = default; // Prevent callers creating extra instances.
    ~ConcreteSingleton() override = default;
};

// Define after the concrete type is complete; implementation chosen here.
Singleton& Singleton::instance() {
    static ConcreteSingleton object;
    return object; // Base reference to derived object; no allocation needed.
}

// Usage: Singleton::instance().do_work();
```

Private inheritance does not replace friendship: it restricts access to the base,
not access to the derived class's private members. Other subclasses could still
expose public constructors; the base cannot enforce uniqueness for all subclasses.
