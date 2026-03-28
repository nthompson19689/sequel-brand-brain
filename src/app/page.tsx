export default function Home() {
  return (
    <div className="p-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-gray-900">Welcome to Brand Brain</h1>
        <p className="mt-2 text-gray-500">
          Your centralized knowledge layer. Every agent reads from the same brain. Every output feeds back into it.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4">
          {[
            { name: "Chat", desc: "Ask questions grounded in company data", href: "/chat" },
            { name: "Agents", desc: "Create, save, and run AI agents", href: "/agents" },
            { name: "Content", desc: "Content production pipeline", href: "/content" },
            { name: "Brain", desc: "Manage brand docs and knowledge", href: "/brain" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block p-5 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <h2 className="font-medium text-gray-900">{item.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
