// Fixture for the tree-sitter highlighter: covers every capture family.
#include <iostream>
#include "counter.h"
#define MAX_SIZE 64

/** Doc comment for Counter. */
namespace demo {

template <typename T>
class Counter {
public:
    explicit Counter(int start) : m_count(start) {}
    int value() const { return m_count; }
    void add(T delta) { m_count += static_cast<int>(delta); }

private:
    int m_count;
};

struct Point {
    double x;
    double y;
};

int square(int n) {
    if (n < 0) {
        throw std::invalid_argument("negative\n");
    }
    return n * n;
}

}  // namespace demo

int main() {
    demo::Counter<int> c{3};
    c.add(2);
    const char ch = 'x';
    bool ok = true;
    auto* p = &c;
    std::string s = "value: ";
    std::cout << s << c.value() << ch << ok << MAX_SIZE << std::endl;
    Point pt{1.5, 2.0};
    pt.x = this_is_free(pt.y, nullptr);
    return p->value() + demo::square(4);
}
