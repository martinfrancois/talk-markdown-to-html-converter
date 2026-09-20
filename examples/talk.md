# Retry budgets in a payment service

Notes for a 20 minute talk. The code below is what goes on screen.

## The problem

A client that retries on every failure turns one slow dependency into a
retry storm. Three things to show:

1. The naive loop
2. A budget that caps retries per window
3. What the metrics look like after the change

## The naive loop

```java
public class NaiveClient {
    public Receipt charge(Payment payment) {
        while (true) {
            try {
                return gateway.charge(payment);
            } catch (GatewayException e) {
                // try again, forever
            }
        }
    }
}
```

## A retry budget

```java
public final class RetryBudget {
    private final int maxRetriesPerWindow;
    private final Deque<Instant> retries = new ArrayDeque<>();

    public RetryBudget(int maxRetriesPerWindow) {
        this.maxRetriesPerWindow = maxRetriesPerWindow;
    }

    public boolean tryAcquire(Instant now) {
        while (!retries.isEmpty() && retries.peekFirst().isBefore(now.minusSeconds(60))) {
            retries.pollFirst();
        }
        if (retries.size() >= maxRetriesPerWindow) {
            return false;
        }
        retries.addLast(now);
        return true;
    }
}
```

## Wiring it in

- Budget of 10 retries per minute per dependency
- Reject with `503 Retry-After` when the budget is empty
- Alert when the budget is empty for more than five minutes

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/charge -d '{"amount": 1200}'
```

## Takeaways

Retries are load. Budget them like any other resource, and put the
number on a dashboard so `p99 < 200ms` stays visible during the outage.
