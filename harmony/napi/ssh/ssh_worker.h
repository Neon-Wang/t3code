#pragma once
#include <condition_variable>
#include <deque>
#include <future>
#include <functional>
#include <chrono>
#include <mutex>
#include <thread>

namespace t3ssh {
// One owner for native control operations, in JS invocation order. Tasks must
// not wait for another task on this worker.
class Worker {
 public:
  explicit Worker(std::function<bool()> idle = {})
    : idle_(std::move(idle)), thread_([this] { Run(); }) {}
  ~Worker() {
    { std::lock_guard<std::mutex> lock(mutex_); stopping_ = true; }
    ready_.notify_one();
    thread_.join();
  }
  void Post(std::packaged_task<void()> task) {
    { std::lock_guard<std::mutex> lock(mutex_); tasks_.push_back(std::move(task)); }
    ready_.notify_one();
  }

 private:
  void Run() {
    bool active = false;
    for (;;) {
      std::packaged_task<void()> task;
      {
        std::unique_lock<std::mutex> lock(mutex_);
        const auto pending = [this] { return stopping_ || !tasks_.empty(); };
        if (active) ready_.wait_for(lock, std::chrono::milliseconds(10), pending);
        else ready_.wait(lock, pending);
        if (tasks_.empty() && stopping_) return;
        if (!tasks_.empty()) {
          task = std::move(tasks_.front());
          tasks_.pop_front();
        }
      }
      if (task.valid()) task();
      active = idle_ && idle_();
    }
  }
  std::function<bool()> idle_;
  std::mutex mutex_;
  std::condition_variable ready_;
  std::deque<std::packaged_task<void()>> tasks_;
  bool stopping_ = false;
  std::thread thread_;
};
} // namespace t3ssh
