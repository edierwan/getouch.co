import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.redirect('http://cms.news.getouch.co/admin', 307);
}