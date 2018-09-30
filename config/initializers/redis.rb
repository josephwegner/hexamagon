require 'connection_pool'

Redis.current = ConnectionPool.new(size: 10, timeout: 5) do
  Redis.new url: ENV['REDIS_URL']
end