#include "ssh_worker.h"
#include <cassert>
#include <vector>
#include <stdexcept>
#include <iostream>
template<typename Action>
std::future<void> Post(t3ssh::Worker& worker, Action action) {
  std::packaged_task<void()> task(std::move(action));
  auto future = task.get_future();
  worker.Post(std::move(task));
  return future;
}
int main() {
  std::vector<int> order;
  std::promise<void> release;
  auto gate = release.get_future().share();
  {
    t3ssh::Worker worker;
    auto first = Post(worker, [&]{gate.wait(); order.push_back(1);});
    auto second = Post(worker, [&]{order.push_back(2); throw std::runtime_error("expected");});
    auto third = Post(worker, [&]{order.push_back(3);});
    assert(third.wait_for(std::chrono::milliseconds(0)) == std::future_status::timeout);
    release.set_value(); first.get();
    bool failed=false;
    try {second.get();} catch(const std::runtime_error&) {failed=true;}
    assert(failed); third.get();
    assert((order == std::vector<int>{1,2,3}));
    Post(worker, [&]{order.push_back(4);});
  }
  assert(order.back() == 4);
  std::promise<void> pumped;
  std::thread::id command_owner;
  bool once = false;
  {
    t3ssh::Worker reactor([&] {
      assert(std::this_thread::get_id() == command_owner);
      if (!once) { once = true; pumped.set_value(); }
      return false;
    });
    Post(reactor, [&] { command_owner = std::this_thread::get_id(); }).get();
    pumped.get_future().get();
  }
  std::cout << "SSH operations stay ordered, propagate failures and drain on shutdown\n";
}
