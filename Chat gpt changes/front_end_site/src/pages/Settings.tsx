import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Sun, Moon, Palette, Bell, Shield, User } from "lucide-react";
import { useUserRole } from '@/hooks/useUserRole';

const Settings = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [autoSave, setAutoSave] = useState(true);

  const { userRole, hasAdminAccess, hasDispenserAccess, loading: roleLoading } = useUserRole()

  useEffect(() => {
    // Check if dark mode is already enabled
    const isDark = document.documentElement.classList.contains('dark');
    setDarkMode(isDark);
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const settingSections = [
    {
      id: 'appearance',
      title: 'Appearance',
      icon: Palette,
      active: true
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      active: false
    },
    {
      id: 'security',
      title: 'Security',
      icon: Shield,
      active: false
    },
    {
      id: 'account',
      title: 'Account',
      icon: User,
      active: false
    }
  ];

  const [activeSection, setActiveSection] = useState('appearance');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <SettingsIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Configure your application preferences</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            {settingSections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <section.icon className="w-5 h-5" />
                <span className="font-medium">{section.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          {activeSection === 'appearance' && (
            <div className="max-w-4xl">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Appearance Settings</h2>
                <p className="text-gray-600 dark:text-gray-400">Customize the look and feel of your application</p>
              </div>

              <Card className="mb-6 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <Palette className="w-5 h-5" />
                    Appearance Settings
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    Customize the look and feel of your application
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">Dark Mode</span>
                        <div className="flex items-center gap-2">
                          <Sun className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          <Moon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Toggle between light and dark themes
                      </p>
                    </div>
                    <Switch
                      checked={darkMode}
                      onCheckedChange={toggleDarkMode}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>

                  <Separator className="bg-gray-200 dark:bg-gray-700" />

                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <span className="font-medium text-gray-900 dark:text-white">Compact View</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Reduce spacing and padding for a more compact interface
                      </p>
                    </div>
                    <Switch className="data-[state=checked]:bg-blue-600" />
                  </div>

                  <Separator className="bg-gray-200 dark:bg-gray-700" />

                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <span className="font-medium text-gray-900 dark:text-white">High Contrast</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Increase contrast for better accessibility
                      </p>
                    </div>
                    <Switch className="data-[state=checked]:bg-blue-600" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-gray-900 dark:text-white">Theme Preview</CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    Preview how your interface will look with current settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Sample Card</span>
                        <Button size="sm" variant="outline">Action</Button>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        This is how your content will appear with the current theme settings.
                      </p>
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="max-w-4xl">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Notification Settings</h2>
                <p className="text-gray-600 dark:text-gray-400">Manage how you receive notifications</p>
              </div>

              <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <Bell className="w-5 h-5" />
                    Notification Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <span className="font-medium text-gray-900 dark:text-white">Push Notifications</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Receive notifications about important updates
                      </p>
                    </div>
                    <Switch
                      checked={notifications}
                      onCheckedChange={setNotifications}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>

                  <Separator className="bg-gray-200 dark:bg-gray-700" />

                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <span className="font-medium text-gray-900 dark:text-white">Email Notifications</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Receive email updates about your account
                      </p>
                    </div>
                    <Switch className="data-[state=checked]:bg-blue-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="max-w-4xl">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Security Settings</h2>
                <p className="text-gray-600 dark:text-gray-400">Manage your account security preferences</p>
              </div>

              <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <Shield className="w-5 h-5" />
                    Security Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <span className="font-medium text-gray-900 dark:text-white">Two-Factor Authentication</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Button variant="outline" size="sm">Configure</Button>
                  </div>

                  <Separator className="bg-gray-200 dark:bg-gray-700" />

                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <span className="font-medium text-gray-900 dark:text-white">Auto-Save</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Automatically save your work to prevent data loss
                      </p>
                    </div>
                    <Switch
                      checked={autoSave}
                      onCheckedChange={setAutoSave}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === 'account' && (
            <div className="max-w-4xl">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Account Settings</h2>
                <p className="text-gray-600 dark:text-gray-400">Manage your account information and preferences</p>
              </div>

              <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <User className="w-5 h-5" />
                    Account Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-900 dark:text-white">Email</label>
                      <p className="text-sm text-gray-600 dark:text-gray-400">user@example.com</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-900 dark:text-white">Role</label>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Administrator</p>
                    </div>
                  </div>
                  <div className="pt-4">
                    <Button variant="outline">Update Profile</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
