import Foundation
import NodeAPI

#NodeModule {
    ["suspend": try NodeFunction { arguments in
        guard let notify = try arguments[0].as(NodeFunction.self),
            let resumePath = try arguments[1].as(String.self)
        else {
            throw NSError(domain: "ExecutorShutdown", code: 1)
        }
        Task { @NodeActor in
            await withCheckedContinuation { continuation in
                DispatchQueue.global().async {
                    guard let pipe = FileHandle(forReadingAtPath: resumePath) else { return }
                    _ = pipe.readDataToEndOfFile()
                    pipe.closeFile()
                    continuation.resume()
                }
                _ = try? notify.call(["suspended"])
            }
            _ = try? notify.call(["resumed"])
        }
        return undefined
    }]
}
