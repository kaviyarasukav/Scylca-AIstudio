const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add import
content = content.replace("import ApiReference from './components/ApiReference';", "import ApiReference from './components/ApiReference';\nimport Analytics from './components/Analytics';\nimport { BarChart2 } from 'lucide-react';");

// Update state
content = content.replace("const [activeTab, setActiveTab] = useState<'trade' | 'api'>('trade');", "const [activeTab, setActiveTab] = useState<'trade' | 'analytics' | 'api'>('trade');");

// Update buttons
let tabsSection = `
          <div className="flex bg-slate-200/50 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('trade')}
              className={\`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all \${activeTab === 'trade' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}\`}
            >
              <Activity className="w-4 h-4" /> Trade Engine
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={\`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all \${activeTab === 'analytics' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}\`}
            >
              <BarChart2 className="w-4 h-4" /> Analytics
            </button>
            <button 
              onClick={() => setActiveTab('api')}
              className={\`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all \${activeTab === 'api' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}\`}
            >
              <Terminal className="w-4 h-4" /> API Reference
            </button>
          </div>`;

content = content.replace(/<div className="flex bg-slate-200\/50 p-1 rounded-lg">[\s\S]*?<\/div>/, tabsSection);

// Add Analytics render block
const analyticsBlock = `
        {activeTab === 'analytics' && (
          <div className="mt-4">
            <Analytics balances={balances} positions={positions} />
          </div>
        )}
`;
content = content.replace("{activeTab === 'api' && (", analyticsBlock + "\n        {activeTab === 'api' && (");

fs.writeFileSync('src/App.tsx', content);
