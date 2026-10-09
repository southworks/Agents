using ProductionReference;

await using var app = AppHost.Build(args);
await app.RunAsync();
