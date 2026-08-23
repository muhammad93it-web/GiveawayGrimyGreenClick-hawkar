import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Eye, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/shared';

const sections = [
  {
    icon: Eye,
    title: 'کام زانیارییە بەکاردێت؟',
    body: 'ئەپەکە تەنها زانیاریی پێویست بۆ بەڕێوەبردنی خەڵات بەکاردهێنێت: کۆمێنتەکان، ژمارەی کۆمێنتی هەر بەشداربوو، و ئەگەر خۆی فەیسبووک ڕێگە بدات، ناو و وێنەی پڕۆفایلی کۆمێنتنووس.',
  },
  {
    icon: ShieldCheck,
    title: 'زانیارییەکان بۆ چی بەکاردێن؟',
    body: 'زانیارییەکان تەنها بۆ ژماردنی کۆمێنتەکان، ڕیزبەندیی بەشداربووان، و دیاریکردنی براوەکانی خەڵات بەکاردێن. بەکارهێنانی بۆ ڕیکلام یان فرۆشتنی زانیاری ڕێگەپێنەدراوە.',
  },
  {
    icon: LockKeyhole,
    title: 'پاراستنی زانیاری',
    body: 'زانیاریی پەیوەندیی فەیسبووک لە سێرڤەر پارێزراوە. ئەپەکە نهێنییەکانی پەیوەندی بۆ بەکارهێنەرانی ئاسایی پیشان نادات.',
  },
  {
    icon: Trash2,
    title: 'سڕینەوەی زانیاری',
    body: 'بەڕێوەبەر دەتوانێت پەیوەندیی فەیسبووک لە ناو ئەپەکە پچڕێنێتەوە؛ بەو کارە زانیاریی خەڵات و کۆمێنتە هەڵگیراوەکان دەسڕێنەوە. بۆ داوای سڕینەوەی زانیاری، دەتوانیت پەیام بۆ پەیجی گیادەرمانی سروشتی ڕانیە بنێریت.',
  },
];

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'سیاسەتی پاراستنی زانیاری | گیادەرمانی سروشتی ڕانیە';
    const description = 'سیاسەتی پاراستنی زانیاریی ئەپی خەڵاتی گیادەرمانی سروشتی ڕانیە.';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, []);

  return (
    <main dir="rtl" className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col items-center text-center">
          <img
            src="/gyadarmany-ranya-logo.png"
            alt="لۆگۆی گیادەرمانی سروشتی ڕانیە"
            className="h-20 w-20 rounded-full border-4 border-white bg-white object-cover shadow-lg"
          />
          <p className="mt-5 text-sm font-bold text-primary">گیادەرمانی سروشتی ڕانیە</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            سیاسەتی پاراستنی زانیاری
          </h1>
          <p className="mt-4 max-w-2xl leading-8 text-muted-foreground">
            ئەم پەڕەیە ڕوون دەکاتەوە چۆن ئەپی خەڵات زانیارییەکان بەکاردێنێت و چۆن دەتوانیت داوای سڕینەوەی زانیاری بکەیت.
          </p>
        </header>

        <Card className="mt-8 overflow-hidden border-primary/15 shadow-md">
          <CardContent className="p-0">
            <div className="border-b bg-primary/5 px-6 py-5">
              <h2 className="text-lg font-bold">پوختەی سیاسەتەکە</h2>
              <p className="mt-2 leading-7 text-muted-foreground">
                ئێمە زانیاریی پێویست بۆ بەڕێوەبردنی خەڵات تەنها لە پەیجی خۆمانەوە وەردەگرین و نایفرۆشین یان نایگوازینەوە بۆ لایەنی سێیەم.
              </p>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-2">
              {sections.map(({ icon: Icon, title, body }) => (
                <section key={title} className="bg-card p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h2 className="font-bold">{title}</h2>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{body}</p>
                </section>
              ))}
            </div>
          </CardContent>
        </Card>

        <section className="mt-8 rounded-xl border border-secondary/30 bg-secondary/10 p-6 text-center">
          <h2 className="font-bold">پەیوەندی و پرسیار</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            بۆ پرسیار لەسەر ئەم سیاسەتە یان داوای سڕینەوەی زانیاری، پەیام بۆ پەیجی گیادەرمانی سروشتی ڕانیە بنێرە.
          </p>
        </section>

        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-bold transition-colors hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            گەڕانەوە بۆ ئەپەکە
          </Link>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          دوا نوێکردنەوە: ٢٣ی ئاب ٢٠٢٦
        </p>
      </div>
    </main>
  );
}